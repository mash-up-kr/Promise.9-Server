import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'

import {
    describeError,
    describeErrorStack,
} from '../../../common/exception/error.util'

import { isRetryableFailure } from './link-analysis.failure'
import { LinkAnalysisQueuePublisher } from './link-analysis.publisher'
import { LinkAnalysisService } from './link-analysis.service'
import {
    LINK_ANALYSIS_MAX_ATTEMPTS,
    LINK_ANALYSIS_MESSAGE_VERSION,
    LINK_ANALYSIS_TASKS,
    LinkAnalysisInput,
    LinkAnalysisRetryMessage,
    LinkAnalysisTask,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

// 종료 시 진행 중인 인라인 작업을 기다리는 상한. 이 시간을 넘기면 남은 작업을 포기하고
// 프로세스를 내려보낸다. 배포 헬스체크가 기다려주는 시간보다 짧아야 한다.
const INLINE_DRAIN_TIMEOUT_MS = 15_000

// 링크 분석을 인라인으로 먼저 실행하고, 재시도 가능한 실패만 큐로 넘긴다.
// 실행 자체는 LinkAnalysisService가 담당하고 여기서는 트리거와 재시도 정책만 다룬다.
@Injectable()
export class LinkAnalysisDispatcher implements OnModuleDestroy {
    private readonly logger = new Logger(LinkAnalysisDispatcher.name)
    private readonly inFlight = new Set<Promise<void>>()

    constructor(
        private readonly linkAnalysisService: LinkAnalysisService,
        private readonly queuePublisher: LinkAnalysisQueuePublisher,
    ) {}

    // 링크 저장 응답을 막지 않도록 인라인 실행을 추적만 하고 즉시 반환한다.
    // tasks를 지정하면 그 작업만 실행한다(예: 링크 수정 후 임베딩만 갱신).
    dispatch(
        input: LinkAnalysisInput,
        tasks: readonly LinkAnalysisTask[] = LINK_ANALYSIS_TASKS,
    ): void {
        const task = this.runInline(input, tasks)

        this.inFlight.add(task)
        void task.finally(() => this.inFlight.delete(task))
    }

    // consumer 진입점. 메시지에 담긴 작업만 실행한다.
    // 실패가 남으면 남은 작업만 담은 메시지를 새로 발행하므로 성공한 AI 호출은 재실행되지 않는다.
    async handleRetry(message: LinkAnalysisRetryMessage): Promise<void> {
        const results = await this.linkAnalysisService.run(
            message,
            message.tasks,
        )

        await this.scheduleRetry(message, results, message.attempt)
    }

    // 종료 신호를 받으면 진행 중인 인라인 작업을 기다려 배포 중 유실을 줄인다.
    async onModuleDestroy(): Promise<void> {
        if (this.inFlight.size === 0) return

        this.logger.log(
            `진행 중인 링크 분석 ${this.inFlight.size}건을 기다립니다.`,
        )

        // 타임아웃이 남으면 프로세스가 내려가지 않으므로 승자와 무관하게 타이머를 정리한다.
        let timer: NodeJS.Timeout | undefined

        try {
            const drained = await Promise.race([
                Promise.allSettled([...this.inFlight]).then(() => true),
                new Promise<false>((resolve) => {
                    timer = setTimeout(
                        () => resolve(false),
                        INLINE_DRAIN_TIMEOUT_MS,
                    )
                }),
            ])

            if (!drained) {
                this.logger.warn(
                    `링크 분석 ${this.inFlight.size}건이 완료되지 않은 상태로 종료합니다.`,
                )
            }
        } finally {
            clearTimeout(timer)
        }
    }

    // fire-and-forget이라 예외를 밖으로 내보내지 않는다.
    private async runInline(
        input: LinkAnalysisInput,
        tasks: readonly LinkAnalysisTask[],
    ): Promise<void> {
        try {
            const results = await this.linkAnalysisService.run(input, tasks)

            await this.scheduleRetry(input, results, 1)
        } catch (error) {
            this.logger.error(
                `링크 분석 인라인 실행이 중단되었습니다. linkId=${input.linkId}: ${describeError(error)}`,
                describeErrorStack(error),
            )
        }
    }

    // 재시도 가능한 실패만 모아 다음 시도를 예약한다.
    private async scheduleRetry(
        input: LinkAnalysisInput,
        results: LinkAnalysisTaskResult[],
        attempt: number,
    ): Promise<void> {
        const failedTasks = results
            .filter(isRetryableFailure)
            .map((result) => result.task)

        if (failedTasks.length === 0) return

        // 상한을 넘긴 실패는 재발행을 멈춘다. 각 작업의 실패 상태는 이미 실행 시점에
        // LinkAnalysisService가 기록했으므로 여기서 다시 쓰지 않는다.
        if (attempt >= LINK_ANALYSIS_MAX_ATTEMPTS) {
            this.logger.error(
                `링크 분석 재시도 상한을 초과했습니다. linkId=${input.linkId}, tasks=${failedTasks.join(',')}, attempt=${attempt}`,
            )
            return
        }

        const message: LinkAnalysisRetryMessage = {
            version: LINK_ANALYSIS_MESSAGE_VERSION,
            linkId: input.linkId,
            userId: input.userId,
            url: input.url,
            tasks: failedTasks,
            attempt: attempt + 1,
        }

        // 발행이 실패하면 예외를 던진다. 인라인 경로에서는 runInline이 로그로 흡수하고,
        // 재시도 경로에서는 consumer가 메시지를 삭제하지 않아 SQS가 다시 전달한다.
        await this.queuePublisher.publishRetry(message)

        this.logger.log(
            `링크 분석 재시도를 예약했습니다. linkId=${input.linkId}, tasks=${failedTasks.join(',')}, attempt=${message.attempt}`,
        )
    }
}
