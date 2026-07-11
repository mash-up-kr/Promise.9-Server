import { DrizzleQueryError } from 'drizzle-orm'

import { POSTGRES_ERROR_CODE } from '../../../common/constants/postgres'
import { DatabaseService } from '../../../config/database/database.service'
import {
    AI_METRIC_ATTEMPT_UNIQUE_INDEX,
    AI_METRIC_STATUS,
    AI_TASK_TYPE,
} from '../ai.constants'

import { AiMetricService } from './ai-metric.service'

type DbMock = {
    select: jest.Mock
    insert: jest.Mock
}

type MetricInsertPayload = {
    id: string
    userLinkId: number
    taskType: string
    attemptNumber: number
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
            select: jest.fn(),
            insert: jest.fn(),
        }
        service = new AiMetricService({
            db,
        } as unknown as DatabaseService)
    })

    it('성공 메트릭을 다음 attemptNumber로 기록한다', async () => {
        const { where: selectWhere } = mockNextAttemptNumbers(db, [2])
        const row = {
            id: '019886ad-0000-7000-8000-000000000001',
            attemptNumber: 2,
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
        expect(selectWhere).toHaveBeenCalledTimes(1)
        const metric = getFirstCallArg<MetricInsertPayload>(insertValues)

        expect(typeof metric.id).toBe('string')
        expect(metric).toMatchObject({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            attemptNumber: 2,
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

    it('실패 메트릭을 다음 attemptNumber로 기록한다', async () => {
        mockNextAttemptNumbers(db, [1])
        const row = {
            id: '019886ad-0000-7000-8000-000000000002',
            attemptNumber: 1,
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
            attemptNumber: 1,
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

    it('attemptNumber unique 충돌은 다시 계산해 재시도한다', async () => {
        mockNextAttemptNumbers(db, [1, 2])
        const row = {
            id: '019886ad-0000-7000-8000-000000000003',
            attemptNumber: 2,
        }
        const insertReturning = jest
            .fn()
            .mockRejectedValueOnce(createAttemptConflictError())
            .mockResolvedValueOnce([row])
        const insertValues = jest.fn().mockReturnValue({
            returning: insertReturning,
        })

        db.insert.mockReturnValue({
            values: insertValues,
        })

        const result = await service.record({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            status: AI_METRIC_STATUS.SUCCESS,
            modelProvider: 'gemini',
            modelName: 'gemini-test',
            promptKey: 'link_tag_default_v1',
            generatedResult: {
                tags: [],
            },
            ttlbMs: 200,
        })

        expect(result).toBe(row)
        expect(insertReturning).toHaveBeenCalledTimes(2)
        expect(insertValues).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                attemptNumber: 1,
            }),
        )
        expect(insertValues).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                attemptNumber: 2,
                promptKey: 'link_tag_default_v1',
            }),
        )
    })

    it('attemptNumber 충돌이 아닌 insert 오류는 재시도하지 않는다', async () => {
        mockNextAttemptNumbers(db, [1])
        const insertError = createUniqueConflictError('other_unique_index')
        const insertReturning = jest.fn().mockRejectedValueOnce(insertError)
        const insertValues = jest.fn().mockReturnValue({
            returning: insertReturning,
        })

        db.insert.mockReturnValue({
            values: insertValues,
        })

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
        expect(insertReturning).toHaveBeenCalledTimes(1)
    })
})

function mockNextAttemptNumbers(db: DbMock, attemptNumbers: number[]) {
    const where = jest.fn()

    attemptNumbers.forEach((nextAttemptNumber) => {
        where.mockResolvedValueOnce([
            {
                nextAttemptNumber,
            },
        ])
    })

    const from = jest.fn().mockReturnValue({
        where,
    })

    db.select.mockReturnValue({
        from,
    })

    return {
        from,
        where,
    }
}

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

function createAttemptConflictError() {
    return createUniqueConflictError(AI_METRIC_ATTEMPT_UNIQUE_INDEX)
}

function createUniqueConflictError(constraint: string) {
    const postgresError = Object.assign(new Error('unique violation'), {
        code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION,
        constraint,
    })

    return new DrizzleQueryError('insert into ai_metrics', [], postgresError)
}

function getFirstCallArg<T>(mock: jest.Mock): T {
    const firstCall = (mock.mock.calls as Array<[T]>)[0]

    if (!firstCall) {
        throw new Error('mock이 호출되지 않았습니다.')
    }

    return firstCall[0]
}
