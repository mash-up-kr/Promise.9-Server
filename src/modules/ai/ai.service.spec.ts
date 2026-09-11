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
    AI_EMBEDDING_TASK_TYPE,
    AI_FAILURE_ERROR_CODE,
    AI_METRIC_STATUS,
    AI_TASK_RESPONSE_SCHEMA_NAME,
    AI_TASK_TYPE,
    AiTaskType,
} from './ai.constants'
import { AiGenerationError } from './ai.exception'
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
            | 'embed'
            | 'generateTextWithResolvedTarget'
            | 'generateObjectWithResolvedTarget'
        >
    >
    let aiMetricService: jest.Mocked<Pick<AiMetricService, 'record'>>
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        llmService = {
            embed: jest.fn(),
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

    it('임베딩의 LLM 설정 오류를 영구 실패 계약으로 변환한다', async () => {
        const configurationError = new LlmConfigurationError(
            'OPENAI_API_KEY 환경변수가 필요합니다.',
        )
        llmService.embed.mockRejectedValueOnce(configurationError)

        const result = service.embedText('임베딩할 텍스트')

        await expect(result).rejects.toMatchObject({
            code: 'LLM_CONFIGURATION_ERROR',
            taskType: AI_EMBEDDING_TASK_TYPE,
            retryable: false,
            cause: configurationError,
        })
    })

    it.each([
        { statusCode: 401, retryable: false },
        { statusCode: 403, retryable: false },
        { statusCode: 429, retryable: true },
        { statusCode: 500, retryable: true },
    ])(
        '임베딩 provider ($statusCode) 오류의 retryable을 ($retryable)로 변환한다',
        async ({ statusCode, retryable }) => {
            const providerError = new LlmProviderError(
                'openai',
                'OPENAI_REQUEST_FAILED',
                'OpenAI failed',
                statusCode,
            )
            llmService.embed.mockRejectedValueOnce(providerError)

            const result = service.embedText('임베딩할 텍스트')

            await expect(result).rejects.toMatchObject({
                code: 'OPENAI_REQUEST_FAILED',
                taskType: AI_EMBEDDING_TASK_TYPE,
                retryable,
                cause: providerError,
            })
        },
    )

    it('수집한 링크 정보로 요약, 태그, 검토 판정을 한 번의 호출로 생성한다', async () => {
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: ' 생성된 요약 ',
                tags: ['AI', '링크 저장', 'NestJS', 'LLM'],
                needsReview: false,
                reviewReason: '검토 대상이 아니면 버려지는 사유',
            },
            ttlbMs: 120,
        })

        const result = await service.generateLinkAnalysis({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
        })

        expect(result).toEqual({
            summary: '생성된 요약',
            tags: ['AI', '링크 저장', 'NestJS', 'LLM'],
            needsReview: false,
            reviewReason: null,
        })
        expect(
            llmService.generateObjectWithResolvedTarget,
        ).toHaveBeenCalledTimes(1)
        const request =
            llmService.generateObjectWithResolvedTarget.mock.calls[0]?.[0]

        expect(request?.prompt).toContain('CONTENT:\n링크 본문')
        expect(request?.system).toContain('자연스러운 한국어 ~요체로 작성한다.')
        expect(request?.system).toContain(
            '태그 값에는 # 문자를 포함하지 않는다.',
        )
        expect(request?.system).toContain(
            'needsReview는 개발자가 이 링크를 직접 확인해야 하는 경우에만 true로 설정한다.',
        )
        expect(request?.responseSchemaName).toBe(
            AI_TASK_RESPONSE_SCHEMA_NAME[AI_TASK_TYPE.LINK_ANALYSIS_GENERATE],
        )
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
                promptKey: 'link_analysis_v1',
            }),
        )
    })

    it('수집 정보가 없으면 URL 한정 안내를 넣고 검토 사유를 정리해 반환한다', async () => {
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: '로그인이 필요한 페이지예요.',
                tags: [],
                needsReview: true,
                reviewReason: ' 로그인 안내 페이지만 수집되었습니다. ',
            },
            ttlbMs: 120,
        })

        const result = await service.generateLinkAnalysis({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: null,
            description: null,
            content: null,
        })

        expect(result).toEqual({
            summary: '로그인이 필요한 페이지예요.',
            tags: [],
            needsReview: true,
            reviewReason: '로그인 안내 페이지만 수집되었습니다.',
        })
        const request =
            llmService.generateObjectWithResolvedTarget.mock.calls[0]?.[0]

        expect(request?.prompt).toContain('수집된 페이지 정보가 없으므로')
    })

    it('요약에 깨진 한글 자모가 섞이면 재시도 가능한 오류로 던진다', async () => {
        const loggerWarnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation()
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: '이 딲ᄌᄂ은 디자이너를 위한 글이에요.',
                tags: ['디자인'],
                needsReview: false,
                reviewReason: null,
            },
            ttlbMs: 120,
        })

        const promise = service.generateLinkAnalysis({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: null,
            description: null,
            content: null,
        })

        await expect(promise).rejects.toBeInstanceOf(AiGenerationError)
        await expect(promise).rejects.toMatchObject({
            code: AI_FAILURE_ERROR_CODE.GENERATED_TEXT_NOT_KOREAN,
            retryable: true,
        })
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('issue=BROKEN_HANGUL'),
        )
        loggerWarnSpy.mockRestore()
    })

    it('태그에 다른 문자 체계가 섞이면 재시도 가능한 오류로 던진다', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation()
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: '도쿄 여행 팁을 소개해요.',
                tags: ['여행', '東京'],
                needsReview: false,
                reviewReason: null,
            },
            ttlbMs: 120,
        })

        await expect(
            service.generateLinkAnalysis({
                userLinkId: 1,
                url: 'https://example.com/article',
                title: null,
                description: null,
                content: null,
            }),
        ).rejects.toMatchObject({
            code: AI_FAILURE_ERROR_CODE.GENERATED_TEXT_NOT_KOREAN,
            retryable: true,
        })
    })

    it('분해된 자모로 온 요약은 NFC로 합쳐서 반환한다', async () => {
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: '게시물 요약이에요.'.normalize('NFD'),
                tags: ['태그'.normalize('NFD')],
                needsReview: false,
                reviewReason: null,
            },
            ttlbMs: 120,
        })

        const result = await service.generateLinkAnalysis({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: null,
            description: null,
            content: null,
        })

        expect(result).toMatchObject({
            summary: '게시물 요약이에요.',
            tags: ['태그'],
        })
    })

    it('검토 대상인데 사유가 비어 있으면 null로 정리한다', async () => {
        llmService.generateObjectWithResolvedTarget.mockResolvedValueOnce({
            model: 'gpt-test',
            data: {
                summary: '요약',
                tags: ['태그'],
                needsReview: true,
                reviewReason: '   ',
            },
            ttlbMs: 120,
        })

        const result = await service.generateLinkAnalysis({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: null,
            description: null,
            content: null,
        })

        expect(result).toMatchObject({ needsReview: true, reviewReason: null })
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
                taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
                AI_TASK_RESPONSE_SCHEMA_NAME[
                    AI_TASK_TYPE.LINK_ANALYSIS_GENERATE
                ],
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toMatchObject({
            code: 'LLM_CONFIGURATION_ERROR',
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            prompt: 'object를 생성해줘',
            schema: z.object({
                value: z.string(),
            }),
        })

        await expect(result).rejects.toMatchObject({
            code: 'LLM_CONFIGURATION_ERROR',
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toBeInstanceOf(AiGenerationError)
        await expect(result).rejects.toMatchObject({
            code: 'OPENAI_REQUEST_FAILED',
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            cause: llmError,
        })
        expect(aiMetricService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                userLinkId: 1,
                taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            prompt: '텍스트를 생성해줘',
        })

        await expect(result).rejects.toMatchObject({
            code: 'OPENAI_REQUEST_FAILED',
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
                taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
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
