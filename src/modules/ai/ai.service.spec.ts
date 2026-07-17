import { Logger } from '@nestjs/common'
import { z } from 'zod'

import { LLM_MODEL } from '../../common/constants/llm'
import {
    LlmConfigurationError,
    LlmProviderError,
} from '../../infrastructure/llm/llm.exception'
import { LlmService } from '../../infrastructure/llm/llm.service'

import { AiMetricService } from './metrics/ai-metric.service'
import {
    AI_METRIC_STATUS,
    AI_TASK_RESPONSE_SCHEMA_NAME,
    AI_TASK_TYPE,
    AiTaskType,
} from './ai.constants'
import { AiGenerationError, AiUseCaseNotImplementedError } from './ai.exception'
import { AiService } from './ai.service'

type InternalAiService = {
    generateText(input: {
        userLinkId: number
        taskType: AiTaskType
        prompt: string
    }): Promise<unknown>
    generateObject(input: {
        userLinkId: number
        taskType: AiTaskType
        prompt: string
        schema: z.ZodObject
    }): Promise<unknown>
}

describe('AiService', () => {
    let service: AiService
    let internalService: InternalAiService
    let llmService: jest.Mocked<
        Pick<
            LlmService,
            | 'resolveTarget'
            | 'generateTextWithResolvedTarget'
            | 'generateObjectWithResolvedTarget'
        >
    >
    let aiMetricService: jest.Mocked<Pick<AiMetricService, 'record'>>
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        llmService = {
            resolveTarget: jest.fn().mockReturnValue({
                provider: 'openai',
                model: LLM_MODEL.GPT_5_4_MINI,
            }),
            generateTextWithResolvedTarget: jest.fn(),
            generateObjectWithResolvedTarget: jest.fn(),
        }
        aiMetricService = {
            record: jest.fn().mockResolvedValue({
                id: '019886ad-0000-7000-8000-000000000001',
            }),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()

        service = new AiService(
            llmService as unknown as LlmService,
            aiMetricService as unknown as AiMetricService,
        )
        internalService = service as unknown as InternalAiService
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
    })

    it('요약과 태그 유스케이스는 구현 전까지 명시적으로 실패한다', async () => {
        await expect(service.generateSummary()).rejects.toBeInstanceOf(
            AiUseCaseNotImplementedError,
        )
        await expect(service.generateTags()).rejects.toBeInstanceOf(
            AiUseCaseNotImplementedError,
        )
    })

    it('텍스트 생성 성공 시 결과와 성공 메트릭을 반환한다', async () => {
        llmService.generateTextWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            text: '생성된 텍스트',
            usage: {
                inputTokens: 10,
                outputTokens: 4,
            },
            ttlbMs: 120,
        })

        const result = await internalService.generateText({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        expect(result).toMatchObject({
            status: AI_METRIC_STATUS.SUCCESS,
            text: '생성된 텍스트',
        })
        expect(result).not.toHaveProperty('metricId')
        expect(llmService.generateTextWithResolvedTarget).toHaveBeenCalledWith({
            system: undefined,
            prompt: '텍스트를 생성해줘',
            target: {
                provider: 'openai',
                model: LLM_MODEL.GPT_5_4_MINI,
            },
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                userLinkId: 1,
                taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
                status: AI_METRIC_STATUS.SUCCESS,
                modelProvider: 'openai',
                modelName: LLM_MODEL.GPT_5_4_MINI,
                generatedResult: '생성된 텍스트',
                inputTokens: 10,
                outputTokens: 4,
                ttlbMs: 120,
            }),
        )
    })

    it('object 생성은 호출자가 넘긴 schema로 검증하고 기록한다', async () => {
        const schema = z.object({
            value: z.string(),
        })
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                value: '생성된 값',
            },
            ttlbMs: 120,
        })

        const result = await internalService.generateObject({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            prompt: 'object를 생성해줘',
            schema,
        })

        expect(result).toMatchObject({
            status: AI_METRIC_STATUS.SUCCESS,
            data: {
                value: '생성된 값',
            },
        })
        expect(
            llmService.generateObjectWithResolvedTarget,
        ).toHaveBeenCalledWith({
            system: undefined,
            prompt: 'object를 생성해줘',
            target: {
                provider: 'openai',
                model: LLM_MODEL.GPT_5_4_MINI,
            },
            schema,
            responseSchemaName:
                AI_TASK_RESPONSE_SCHEMA_NAME[AI_TASK_TYPE.TAG_GENERATE],
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                taskType: AI_TASK_TYPE.TAG_GENERATE,
                status: AI_METRIC_STATUS.SUCCESS,
                generatedResult: {
                    value: '생성된 값',
                },
            }),
        )
    })

    it('메트릭 기록이 실패해도 LLM 생성 결과는 반환한다', async () => {
        aiMetricService.record.mockRejectedValueOnce(
            new Error('metric db failed'),
        )
        llmService.generateTextWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            text: '생성된 텍스트',
            ttlbMs: 120,
        })

        const result = await internalService.generateText({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        expect(result).toMatchObject({
            status: AI_METRIC_STATUS.SUCCESS,
            text: '생성된 텍스트',
        })
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            expect.not.stringContaining('metric db failed'),
        )
    })

    it('target 설정 오류는 메트릭 없이 AiGenerationError로 감싼다', async () => {
        const configurationError = new LlmConfigurationError(
            '지원하지 않는 model입니다.',
        )
        llmService.resolveTarget.mockImplementationOnce(() => {
            throw configurationError
        })

        const result = internalService.generateText({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toMatchObject({
            code: 'LLM_CONFIGURATION_ERROR',
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            cause: configurationError,
        })
        expect(llmService.generateTextWithResolvedTarget).not.toHaveBeenCalled()
        expect(aiMetricService.record).not.toHaveBeenCalled()
    })

    it('provider 요청 전 설정 오류는 실패 메트릭을 기록하지 않는다', async () => {
        const configurationError = new LlmConfigurationError(
            'structured output schema가 올바르지 않습니다.',
        )
        llmService.generateObjectWithResolvedTarget.mockRejectedValueOnce(
            configurationError,
        )

        const result = internalService.generateObject({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            prompt: 'object를 생성해줘',
            schema: z.object({
                value: z.string(),
            }),
        })

        await expect(result).rejects.toMatchObject({
            code: 'LLM_CONFIGURATION_ERROR',
            taskType: AI_TASK_TYPE.TAG_GENERATE,
            cause: configurationError,
        })
        expect(aiMetricService.record).not.toHaveBeenCalled()
    })

    it('LLM 오류는 실패 메트릭으로 기록하고 AiGenerationError로 감싼다', async () => {
        const llmError = new LlmProviderError(
            'openai',
            'OPENAI_REQUEST_FAILED',
            'OpenAI failed',
        )
        llmService.generateTextWithResolvedTarget.mockRejectedValueOnce(
            llmError,
        )

        const result = internalService.generateText({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toBeInstanceOf(AiGenerationError)
        await expect(result).rejects.toMatchObject({
            code: 'OPENAI_REQUEST_FAILED',
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            cause: llmError,
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                userLinkId: 1,
                taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
                status: AI_METRIC_STATUS.FAILED,
                modelProvider: 'openai',
                modelName: LLM_MODEL.GPT_5_4_MINI,
                errorCode: 'OPENAI_REQUEST_FAILED',
                errorMessage: 'OpenAI failed',
            }),
        )
    })

    it('실패 메트릭 기록이 실패해도 원래 LLM 오류를 보존한다', async () => {
        const llmError = new LlmProviderError(
            'openai',
            'OPENAI_REQUEST_FAILED',
            'OpenAI failed',
        )
        llmService.generateTextWithResolvedTarget.mockRejectedValueOnce(
            llmError,
        )
        aiMetricService.record.mockRejectedValueOnce(new Error('db failed'))

        const result = internalService.generateText({
            userLinkId: 1,
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toMatchObject({
            code: 'OPENAI_REQUEST_FAILED',
            taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
            cause: llmError,
        })
        expect(loggerErrorSpy).toHaveBeenCalled()
    })

    it('object schema 검증 오류는 실패 메트릭으로 기록한다', async () => {
        llmService.generateObjectWithResolvedTarget.mockRejectedValueOnce(
            new z.ZodError([
                {
                    code: 'custom',
                    path: ['value'],
                    message: 'invalid value',
                },
            ]),
        )

        await expect(
            internalService.generateObject({
                userLinkId: 1,
                taskType: AI_TASK_TYPE.TAG_GENERATE,
                prompt: 'object를 생성해줘',
                schema: z.object({
                    value: z.string(),
                }),
            }),
        ).rejects.toMatchObject({
            code: 'AI_GENERATED_RESULT_VALIDATION_FAILED',
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                status: AI_METRIC_STATUS.FAILED,
                errorCode: 'AI_GENERATED_RESULT_VALIDATION_FAILED',
            }),
        )
    })
})
