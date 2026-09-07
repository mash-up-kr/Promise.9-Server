import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisQueueConsumer } from './link-analysis.consumer'
import { JOB_TIMEOUT_MS } from './link-job.constant'
import { LinkJobRepository } from './link-job.repository'

const message = {
    Body: JSON.stringify({ version: 3, jobId: 1 }),
    ReceiptHandle: 'receipt',
    MessageId: 'message',
}
const input = {
    job: { id: 1, jobType: 'ANALYZE', executionToken: 'token' },
    link: { id: 1 },
    tags: [],
}
function setup() {
    const config = {
        get: jest.fn(
            (key: string) =>
                ({
                    SQS_LINK_ANALYSIS_QUEUE_URL: 'https://sqs.test/queue',
                    SQS_CONSUMER_ENABLED: false,
                })[key],
        ),
    }
    const sqs = {
        delete: jest.fn().mockResolvedValue({}),
        changeVisibility: jest.fn().mockResolvedValue({}),
        receive: jest.fn(),
    }
    const jobs = {
        claim: jest.fn().mockResolvedValue({ status: 'CLAIMED', input }),
        finish: jest.fn().mockResolvedValue(true),
    }
    const executor = {
        execute: jest.fn().mockResolvedValue({ patch: { aiSummary: '요약' } }),
    }
    return {
        sqs,
        jobs,
        executor,
        consumer: new LinkAnalysisQueueConsumer(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            sqs as unknown as SqsService,
            jobs as unknown as LinkJobRepository,
            executor,
        ),
    }
}
describe('LinkAnalysisQueueConsumer', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation()
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })
    it('결과가 DB에 반영된 이후에만 메시지를 삭제한다', async () => {
        const { consumer, jobs, sqs } = setup()
        jobs.finish.mockImplementation(() => {
            expect(sqs.delete).not.toHaveBeenCalled()
            return Promise.resolve(true)
        })
        await consumer.process(message)
        expect(sqs.delete).toHaveBeenCalledTimes(1)
    })
    it('DB 반영 실패 시 메시지를 삭제하지 않는다', async () => {
        const { consumer, jobs, sqs } = setup()
        jobs.finish.mockRejectedValue(new Error('db unavailable'))
        await consumer.process(message)
        expect(sqs.delete).not.toHaveBeenCalled()
    })
    it('실행 소유권을 잃으면 메시지도 삭제하지 않는다', async () => {
        const { consumer, jobs, sqs } = setup()
        jobs.finish.mockResolvedValue(false)
        await consumer.process(message)
        expect(sqs.delete).not.toHaveBeenCalled()
    })
    it('이미 종료된 Job은 AI 호출 없이 삭제한다', async () => {
        const { consumer, jobs, executor, sqs } = setup()
        jobs.claim.mockResolvedValue({ status: 'DONE' })
        await consumer.process(message)
        expect(executor.execute).not.toHaveBeenCalled()
        expect(sqs.delete).toHaveBeenCalledTimes(1)
    })
    it('실행 중인 작업은 재전달을 예약하고 삭제하지 않는다', async () => {
        const { consumer, jobs, executor, sqs } = setup()
        jobs.claim.mockResolvedValue({ status: 'WAIT' })
        await consumer.process(message)
        expect(executor.execute).not.toHaveBeenCalled()
        expect(sqs.changeVisibility).toHaveBeenCalledTimes(1)
        expect(sqs.delete).not.toHaveBeenCalled()
    })
    it('기존 v2 메시지를 새 작업으로 오인하지 않는다', async () => {
        const { consumer, jobs, sqs } = setup()
        await consumer.process({
            ...message,
            Body: JSON.stringify({ version: 2, linkId: 1, tasks: ['SUMMARY'] }),
        })
        expect(jobs.claim).not.toHaveBeenCalled()
        expect(sqs.delete).not.toHaveBeenCalled()
    })
    it('전체 제한 시간이 지나면 중단 신호를 보내고 재시도를 기록한다', async () => {
        jest.useFakeTimers()
        const { consumer, jobs, executor, sqs } = setup()
        executor.execute.mockImplementation(() => new Promise(() => undefined))
        const processing = consumer.process(message)
        await Promise.resolve()
        jest.advanceTimersByTime(JOB_TIMEOUT_MS)
        await processing
        const calls = executor.execute.mock.calls as unknown[][]
        expect((calls[0][1] as AbortSignal).aborted).toBe(true)
        expect((jobs.finish.mock.calls as unknown[][])[0][1]).toMatchObject({
            failure: { code: 'EXECUTION_TIMEOUT', retryable: true },
        })
        expect(sqs.delete).toHaveBeenCalledTimes(1)
    })
    it('실행 예외도 Job 실패 처리 후 삭제한다', async () => {
        const { consumer, jobs, executor, sqs } = setup()
        executor.execute.mockRejectedValue(new Error('secret URL'))
        await consumer.process(message)
        expect((jobs.finish.mock.calls as unknown[][])[0][1]).toMatchObject({
            failure: { code: 'EXECUTION_FAILED', retryable: true },
        })
        expect(JSON.stringify(jobs.finish.mock.calls)).not.toContain(
            'secret URL',
        )
        expect(sqs.delete).toHaveBeenCalledTimes(1)
    })
})
