import { Logger } from '@nestjs/common'

import { LINK_ANALYSIS_MAX_ATTEMPTS } from './link-analysis.constant'
import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import { LinkAnalysisQueuePublisher } from './link-analysis.publisher'
import { LinkAnalysisService } from './link-analysis.service'
import {
    LinkAnalysisRetryMessage,
    LinkAnalysisTask,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

const INPUT = {
    linkId: 1,
    userId: 2,
    url: 'https://example.com/article',
}

function failed(
    task: LinkAnalysisTask,
    kind: 'RETRYABLE' | 'PERMANENT' = 'RETRYABLE',
): LinkAnalysisTaskResult {
    return { task, status: 'FAILED', kind, error: new Error(`${task} failed`) }
}

function succeeded(task: LinkAnalysisTask): LinkAnalysisTaskResult {
    return { task, status: 'SUCCESS' }
}

describe('LinkAnalysisDispatcher', () => {
    let runner: jest.Mocked<Pick<LinkAnalysisService, 'run'>>
    let queuePublisher: jest.Mocked<
        Pick<LinkAnalysisQueuePublisher, 'publishRetry'>
    >
    let dispatcher: LinkAnalysisDispatcher
    let loggerErrorSpy: jest.SpyInstance
    let loggerLogSpy: jest.SpyInstance

    beforeEach(() => {
        runner = { run: jest.fn().mockResolvedValue([]) }
        queuePublisher = {
            publishRetry: jest.fn().mockResolvedValue(undefined),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()

        dispatcher = new LinkAnalysisDispatcher(
            runner as unknown as LinkAnalysisService,
            queuePublisher as unknown as LinkAnalysisQueuePublisher,
        )
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
        loggerLogSpy.mockRestore()
    })

    describe('dispatch', () => {
        it('전체 작업을 인라인 실행하고 즉시 반환한다', async () => {
            dispatcher.dispatch(INPUT)

            expect(runner.run).toHaveBeenCalledWith(INPUT, [
                'CONTENT',
                'SUMMARY',
                'TAGS',
                'EMBEDDING',
            ])

            await dispatcher.onModuleDestroy()

            expect(queuePublisher.publishRetry).not.toHaveBeenCalled()
        })

        it('인라인 실행이 모두 성공하면 큐를 쓰지 않는다', async () => {
            runner.run.mockResolvedValueOnce([
                succeeded('CONTENT'),
                succeeded('SUMMARY'),
                succeeded('TAGS'),
                succeeded('EMBEDDING'),
            ])

            dispatcher.dispatch(INPUT)
            await dispatcher.onModuleDestroy()

            expect(queuePublisher.publishRetry).not.toHaveBeenCalled()
        })

        it('실패한 작업만 담아 재시도를 예약한다', async () => {
            runner.run.mockResolvedValueOnce([
                succeeded('CONTENT'),
                succeeded('SUMMARY'),
                failed('TAGS'),
                failed('EMBEDDING'),
            ])

            dispatcher.dispatch(INPUT)
            await dispatcher.onModuleDestroy()

            expect(queuePublisher.publishRetry).toHaveBeenCalledWith({
                version: 2,
                linkId: 1,
                userId: 2,
                url: 'https://example.com/article',
                tasks: ['TAGS', 'EMBEDDING'],
                attempt: 2,
            })
        })

        it('PERMANENT 실패는 큐에 넣지 않는다', async () => {
            runner.run.mockResolvedValueOnce([
                failed('TAGS', 'PERMANENT'),
                succeeded('SUMMARY'),
            ])

            dispatcher.dispatch(INPUT)
            await dispatcher.onModuleDestroy()

            expect(queuePublisher.publishRetry).not.toHaveBeenCalled()
        })

        it('발행 실패는 로그로 흡수해 저장 요청을 깨뜨리지 않는다', async () => {
            runner.run.mockResolvedValueOnce([failed('SUMMARY')])
            queuePublisher.publishRetry.mockRejectedValueOnce(
                new Error('publish failed'),
            )

            expect(() => dispatcher.dispatch(INPUT)).not.toThrow()
            await dispatcher.onModuleDestroy()

            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('인라인 실행이 중단되었습니다'),
                expect.anything(),
            )
        })

        it('tasks를 지정하면 그 작업만 인라인 실행한다', async () => {
            dispatcher.dispatch(INPUT, ['EMBEDDING'])
            await dispatcher.onModuleDestroy()

            expect(runner.run).toHaveBeenCalledWith(INPUT, ['EMBEDDING'])
        })
    })

    describe('handleRetry', () => {
        const message: LinkAnalysisRetryMessage = {
            version: 2,
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
            tasks: ['SUMMARY', 'TAGS'],
            attempt: 2,
        }

        it('메시지에 담긴 작업만 실행한다', async () => {
            await dispatcher.handleRetry(message)

            expect(runner.run).toHaveBeenCalledWith(message, [
                'SUMMARY',
                'TAGS',
            ])
        })

        it('부분 실패는 남은 작업만 다시 발행해 성공한 작업을 재실행하지 않는다', async () => {
            runner.run.mockResolvedValueOnce([
                succeeded('SUMMARY'),
                failed('TAGS'),
            ])

            await dispatcher.handleRetry(message)

            expect(queuePublisher.publishRetry).toHaveBeenCalledWith(
                expect.objectContaining({ tasks: ['TAGS'], attempt: 3 }),
            )
        })

        it('발행이 실패하면 예외를 던져 메시지가 삭제되지 않게 한다', async () => {
            runner.run.mockResolvedValueOnce([failed('TAGS')])
            queuePublisher.publishRetry.mockRejectedValueOnce(
                new Error('publish failed'),
            )

            await expect(dispatcher.handleRetry(message)).rejects.toThrow(
                'publish failed',
            )
        })

        it('시도 상한을 넘기면 재발행을 멈추고 로그만 남긴다', async () => {
            runner.run.mockResolvedValueOnce([failed('SUMMARY')])

            await dispatcher.handleRetry({
                ...message,
                attempt: LINK_ANALYSIS_MAX_ATTEMPTS,
            })

            expect(queuePublisher.publishRetry).not.toHaveBeenCalled()
            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('재시도 상한을 초과했습니다'),
            )
        })
    })
})
