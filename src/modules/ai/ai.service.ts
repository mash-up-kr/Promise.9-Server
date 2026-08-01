import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'

import {
    LlmConfigurationError,
    LlmError,
} from '../../infrastructure/llm/llm.exception'
import { LlmService } from '../../infrastructure/llm/llm.service'

import { AiMetricService } from './metrics/ai-metric.service'
import { AiMetricGeneratedResult } from './metrics/ai-metric.type'
import {
    AI_FAILURE_ERROR_CODE,
    AI_LINK_ANALYSIS,
    AI_METRIC_STATUS,
    AI_TASK_RESPONSE_SCHEMA_NAME,
    AI_TASK_TYPE,
} from './ai.constants'
import { AiGenerationError } from './ai.exception'
import {
    AiCreateGenerationErrorInput,
    AiGenerateObjectInput,
    AiGenerateObjectResult,
    AiGenerateTextInput,
    AiGenerateTextResult,
    AiGenerationFailure,
    AiLinkAnalysisInput,
    AiRecordMetricInput,
    AiResolveTargetInput,
    AiSummaryResult,
    AiTagsResult,
} from './ai.type'
import {
    aiSummaryResultSchema,
    aiTagsResultSchema,
} from './ai-link-analysis.schema'

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name)

    constructor(
        private readonly llmService: LlmService,
        private readonly aiMetricService: AiMetricService,
    ) {}

    // 수집한 링크 정보를 기반으로 최대 300자의 한국어 요약을 생성한다.
    async generateSummary(
        input: AiLinkAnalysisInput,
    ): Promise<AiSummaryResult> {
        const result = await this.generateObject({
            userLinkId: input.userLinkId,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            promptKey: AI_LINK_ANALYSIS.summaryPromptKey,
            llm: input.llm,
            system: [
                '너는 사용자가 저장한 링크를 소개하는 친절한 콘텐츠 큐레이터다.',
                `이 링크의 핵심 내용을 ${AI_LINK_ANALYSIS.summaryMaxLength}자 내외로 요약하되, 중복, 왜곡, 과장을 피하고 중요 정보를 최대한 포함한다.`,
                '핵심 주제와 중요한 내용을 처음 보는 사람도 이해하기 쉽게 정리한다.',
                '모든 문장은 자연스러운 한국어 ~요체로 작성한다.',
                '마지막 문장은 사용자가 이 링크에서 얻을 수 있는 정보나 도움을 안내하는 뉘앙스로 마무리한다.',
                '마지막 문장도 반드시 원문에서 확인할 수 있는 내용에 근거한다.',
                '입력에 없는 사실, 과장된 효용, 광고 문구, 민감정보를 추정하지 않는다.',
            ].join('\n'),
            prompt: this.buildLinkInformationPrompt(input),
            schema: aiSummaryResultSchema,
        })

        return {
            summary: result.data.summary.trim(),
        }
    }

    // 수집한 링크 정보를 기반으로 대분류 구분 없이 내용 태그를 최대 5개 생성한다.
    async generateTags(input: AiLinkAnalysisInput): Promise<AiTagsResult> {
        const result = await this.generateObject({
            userLinkId: input.userLinkId,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            promptKey: AI_LINK_ANALYSIS.tagPromptKey,
            llm: input.llm,
            system: [
                '너는 링크 저장 서비스의 태그 생성기다.',
                `링크 내용을 대표하는 구체적인 태그를 ${AI_LINK_ANALYSIS.tagMaxCount}개 생성한다.`,
                `각 태그는 공백 포함 1자 이상 ${AI_LINK_ANALYSIS.tagMaxLength}자 이하로 작성한다.`,
                '태그 값에는 # 문자를 포함하지 않는다.',
                '태그는 넓은 범주에서 시작해 세부 개념으로 이어지는 순서로 생성한다.',
                '먼저 링크의 상위 분야를 제시하고, 이후 핵심 주제와 구체적인 기술·개념·대상을 차례로 제시한다.',
                "예: ['개발', '클로드 코드', 'AI', '프롬프트 엔지니어링', '하네스 엔지니어링']",
                "예: ['경제', '금융', '주식', '코스피', '반도체 기업 실적']",
                "예: ['문화', '영화', '애니메이션','특정 작품명']",
                "예: ['건강', '운동', '근력 운동', '홈트', '스쿼트 자세']",
                '같은 의미나 같은 표기의 태그를 중복해서 생성하지 않는다.',
                '태그 앞뒤에 공백을 넣지 않고 단어 사이에 연속 공백을 사용하지 않는다.',
                '태그를 공백으로 생성하지 않는다.',
                '광고 문구와 근거 없는 민감정보 추정을 피한다.',
            ].join('\n'),
            prompt: this.buildLinkInformationPrompt(input),
            schema: aiTagsResultSchema,
        })

        return result.data
    }

    // URL과 실제로 수집된 필드만 조합해 요약·태그 생성의 공통 사용자 prompt를 만든다.
    private buildLinkInformationPrompt(input: AiLinkAnalysisInput): string {
        return [
            `URL: ${input.url}`,
            input.title ? `TITLE: ${input.title}` : undefined,
            input.description ? `DESCRIPTION: ${input.description}` : undefined,
            input.content ? `CONTENT:\n${input.content}` : undefined,
            !input.title && !input.description && !input.content
                ? '수집된 페이지 정보가 없으므로 URL에서 확실히 알 수 있는 범위만 사용한다.'
                : undefined,
        ]
            .filter((value): value is string => Boolean(value))
            .join('\n')
    }

    private async generateText(
        input: AiGenerateTextInput,
    ): Promise<AiGenerateTextResult> {
        const target = this.resolveTarget(input)
        const startedAt = performance.now()

        try {
            const result = await this.llmService.generateTextWithResolvedTarget(
                {
                    system: input.system,
                    prompt: input.prompt,
                    target,
                },
            )
            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                generatedResult: result.text,
                usage: result.usage,
                ttlbMs: result.ttlbMs,
            })

            return {
                ...result,
                status: AI_METRIC_STATUS.SUCCESS,
            }
        } catch (error) {
            const failure = this.toFailure(error)

            if (error instanceof LlmConfigurationError) {
                throw this.createGenerationError({
                    error,
                    taskType: input.taskType,
                    failure,
                })
            }

            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                ...failure,
                ttlbMs: Math.round(performance.now() - startedAt),
            })

            throw this.createGenerationError({
                error,
                taskType: input.taskType,
                failure,
            })
        }
    }

    private async generateObject<T extends AiMetricGeneratedResult>(
        input: AiGenerateObjectInput<T>,
    ): Promise<AiGenerateObjectResult<T>> {
        const target = this.resolveTarget(input)
        const startedAt = performance.now()

        try {
            const result =
                await this.llmService.generateObjectWithResolvedTarget({
                    system: input.system,
                    prompt: input.prompt,
                    target,
                    schema: input.schema,
                    responseSchemaName:
                        AI_TASK_RESPONSE_SCHEMA_NAME[input.taskType],
                })
            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                generatedResult: result.data,
                usage: result.usage,
                ttlbMs: result.ttlbMs,
            })

            return {
                ...result,
                status: AI_METRIC_STATUS.SUCCESS,
            }
        } catch (error) {
            const failure = this.toFailure(error)

            if (error instanceof LlmConfigurationError) {
                throw this.createGenerationError({
                    error,
                    taskType: input.taskType,
                    failure,
                })
            }

            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                ...failure,
                ttlbMs: Math.round(performance.now() - startedAt),
            })

            throw this.createGenerationError({
                error,
                taskType: input.taskType,
                failure,
            })
        }
    }

    private resolveTarget(input: AiResolveTargetInput) {
        try {
            return this.llmService.resolveTarget({ target: input.llm })
        } catch (error) {
            throw this.createGenerationError({
                error,
                taskType: input.taskType,
            })
        }
    }

    private createGenerationError(input: AiCreateGenerationErrorInput) {
        const failure = input.failure ?? this.toFailure(input.error)

        return new AiGenerationError({
            code: failure.errorCode,
            message: failure.errorMessage,
            taskType: input.taskType,
            cause: input.error,
        })
    }

    private toFailure(error: unknown): AiGenerationFailure {
        if (error instanceof LlmError) {
            return {
                errorCode: error.code,
                errorMessage: error.message,
            }
        }

        if (error instanceof z.ZodError) {
            return {
                errorCode:
                    AI_FAILURE_ERROR_CODE.GENERATED_RESULT_VALIDATION_FAILED,
                errorMessage: error.message,
            }
        }

        if (error instanceof Error) {
            return {
                errorCode: error.name,
                errorMessage: error.message,
            }
        }

        return {
            errorCode: AI_FAILURE_ERROR_CODE.UNKNOWN_ERROR,
            errorMessage: String(error),
        }
    }

    private async recordMetric(input: AiRecordMetricInput) {
        try {
            const baseMetric = {
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                modelProvider: input.target.provider,
                modelName: input.target.model,
                promptKey: input.promptKey,
                inputTokens: input.usage?.inputTokens,
                outputTokens: input.usage?.outputTokens,
                ttlbMs: input.ttlbMs,
            }

            if ('errorCode' in input) {
                return await this.aiMetricService.record({
                    ...baseMetric,
                    status: AI_METRIC_STATUS.FAILED,
                    errorCode: input.errorCode,
                    errorMessage: input.errorMessage,
                })
            }

            return await this.aiMetricService.record({
                ...baseMetric,
                status: AI_METRIC_STATUS.SUCCESS,
                generatedResult: input.generatedResult,
            })
        } catch (error) {
            this.logMetricError(
                `AI 메트릭 기록에 실패했습니다. userLinkId=${input.userLinkId}, taskType=${input.taskType}`,
                error,
            )

            return undefined
        }
    }

    private logMetricError(message: string, error: unknown) {
        const errorType = error instanceof Error ? error.name : typeof error

        this.logger.error(`${message}, errorType=${errorType}`)
    }
}
