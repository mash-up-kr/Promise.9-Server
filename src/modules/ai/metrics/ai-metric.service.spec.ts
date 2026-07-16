import { DatabaseService } from '../../../config/database/database.service'
import { AI_METRIC_STATUS, AI_TASK_TYPE } from '../ai.constants'

import { AiMetricService } from './ai-metric.service'

type DbMock = {
    insert: jest.Mock
}

type MetricInsertPayload = {
    id: string
    userLinkId: number
    taskType: string
    status: string
    modelProvider: string
    modelName: string
    promptKey: string | null
    inputTokens: number | null
    outputTokens: number | null
    generatedResult: unknown
    ttlbMs: number
    errorCode: string | null
    errorMessage: string | null
}

describe('AiMetricService', () => {
    let db: DbMock
    let service: AiMetricService

    beforeEach(() => {
        db = {
            insert: jest.fn(),
        }
        service = new AiMetricService({
            db,
        } as unknown as DatabaseService)
    })

    it('성공 메트릭을 기록한다', async () => {
        const row = {
            id: '019886ad-0000-7000-8000-000000000001',
        }
        const { values: insertValues } = mockInsertReturning(db, [row])

        const result = await service.record({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            status: AI_METRIC_STATUS.SUCCESS,
            modelProvider: 'openai',
            modelName: 'gpt-test',
            generatedResult: '생성된 텍스트',
            inputTokens: 10,
            outputTokens: 4,
            ttlbMs: 120,
        })

        expect(result).toBe(row)
        const metric = getFirstCallArg<MetricInsertPayload>(insertValues)

        expect(typeof metric.id).toBe('string')
        expect(metric).toMatchObject({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            status: AI_METRIC_STATUS.SUCCESS,
            modelProvider: 'openai',
            modelName: 'gpt-test',
            promptKey: null,
            inputTokens: 10,
            outputTokens: 4,
            generatedResult: '생성된 텍스트',
            ttlbMs: 120,
            errorCode: null,
            errorMessage: null,
        })
    })

    it('실패 메트릭을 기록한다', async () => {
        const row = {
            id: '019886ad-0000-7000-8000-000000000002',
        }
        const { values: insertValues } = mockInsertReturning(db, [row])

        const result = await service.record({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            status: AI_METRIC_STATUS.FAILED,
            modelProvider: 'gemini',
            modelName: 'gemini-test',
            promptKey: 'link_tag_default_v1',
            errorCode: 'GEMINI_REQUEST_FAILED',
            errorMessage: 'Gemini failed',
            ttlbMs: 300,
        })

        expect(result).toBe(row)
        const metric = getFirstCallArg<MetricInsertPayload>(insertValues)

        expect(metric).toMatchObject({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            status: AI_METRIC_STATUS.FAILED,
            modelProvider: 'gemini',
            modelName: 'gemini-test',
            promptKey: 'link_tag_default_v1',
            inputTokens: null,
            outputTokens: null,
            generatedResult: null,
            ttlbMs: 300,
            errorCode: 'GEMINI_REQUEST_FAILED',
            errorMessage: 'Gemini failed',
        })
    })

    it('insert 오류를 그대로 전파한다', async () => {
        const insertError = new Error('insert failed')
        const returning = jest.fn().mockRejectedValue(insertError)
        const values = jest.fn().mockReturnValue({ returning })

        db.insert.mockReturnValue({ values })

        await expect(
            service.record({
                userLinkId: 1,
                taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
                status: AI_METRIC_STATUS.FAILED,
                modelProvider: 'openai',
                modelName: 'gpt-test',
                errorCode: 'OPENAI_REQUEST_FAILED',
                errorMessage: 'OpenAI failed',
                ttlbMs: 300,
            }),
        ).rejects.toBe(insertError)
        expect(returning).toHaveBeenCalledTimes(1)
    })
})

function mockInsertReturning(db: DbMock, rows: unknown[]) {
    const returning = jest.fn().mockResolvedValue(rows)
    const values = jest.fn().mockReturnValue({
        returning,
    })

    db.insert.mockReturnValue({
        values,
    })

    return {
        values,
        returning,
    }
}

function getFirstCallArg<T>(mock: jest.Mock): T {
    const firstCall = (mock.mock.calls as Array<[T]>)[0]

    if (!firstCall) {
        throw new Error('mock이 호출되지 않았습니다.')
    }

    return firstCall[0]
}
