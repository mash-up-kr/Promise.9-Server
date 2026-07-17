import { ConfigService } from '@nestjs/config'
import { z } from 'zod'

import { LLM_MODEL } from '../../common/constants/llm'
import { ValidatedEnvironment } from '../../config/environment'

import { GeminiProvider } from './providers/gemini/gemini.provider'
import { OpenAiProvider } from './providers/openai/openai.provider'
import { LLM_PROVIDER } from './llm.constants'
import { LlmConfigurationError, LlmResponseParseError } from './llm.exception'
import { LlmService } from './llm.service'
import {
    LlmProvider,
    LlmProviderGenerateInput,
    LlmTargetOptions,
} from './llm.type'

describe('LlmService', () => {
    let service: LlmService
    let openAiProvider: jest.Mocked<LlmProvider>
    let geminiProvider: jest.Mocked<LlmProvider>
    let openAiGenerate: jest.Mock
    let geminiGenerate: jest.Mock

    beforeEach(() => {
        const config = {
            get: jest.fn((key: string) => {
                if (key === 'LLM_DEFAULT_MODEL') {
                    return LLM_MODEL.GPT_5_4_MINI
                }

                return undefined
            }),
        } as unknown as ConfigService<ValidatedEnvironment, true>
        openAiGenerate = jest.fn()
        openAiProvider = {
            name: LLM_PROVIDER.OPENAI,
            generate: openAiGenerate,
        }
        geminiGenerate = jest.fn()
        geminiProvider = {
            name: LLM_PROVIDER.GEMINI,
            generate: geminiGenerate,
        }

        service = new LlmService(
            config,
            openAiProvider as unknown as OpenAiProvider,
            geminiProvider as unknown as GeminiProvider,
        )
    })

    it('OpenAI 모델만 받아 provider를 내부에서 결정한다', () => {
        const target = service.resolveTarget({
            target: {
                model: LLM_MODEL.GPT_5_4_MINI,
                options: {
                    temperature: 0.2,
                },
            },
        })

        expect(target).toMatchObject({
            provider: LLM_PROVIDER.OPENAI,
            model: LLM_MODEL.GPT_5_4_MINI,
            options: {
                temperature: 0.2,
            },
        })
    })

    it('Gemini 모델만 받아 provider를 내부에서 결정한다', () => {
        const target = service.resolveTarget({
            target: {
                model: LLM_MODEL.GEMINI_3_5_FLASH,
                options: {
                    topP: 0.8,
                },
            },
        })

        expect(target).toMatchObject({
            provider: LLM_PROVIDER.GEMINI,
            model: LLM_MODEL.GEMINI_3_5_FLASH,
            options: {
                topP: 0.8,
            },
        })
    })

    it('target이 없으면 환경변수 기본 model로 provider를 결정한다', () => {
        expect(service.resolveTarget({})).toMatchObject({
            provider: LLM_PROVIDER.OPENAI,
            model: LLM_MODEL.GPT_5_4_MINI,
        })
    })

    it('등록되지 않은 모델은 provider로 요청하기 전에 실패한다', () => {
        const target = {
            model: 'unknown-model',
        } as unknown as LlmTargetOptions

        expect(() => service.resolveTarget({ target })).toThrow(
            LlmConfigurationError,
        )
    })

    it('generateText는 model에 맞는 provider의 텍스트를 반환한다', async () => {
        openAiProvider.generate.mockResolvedValueOnce({
            text: '생성된 텍스트',
            model: LLM_MODEL.GPT_5_4_MINI,
            usage: {
                inputTokens: 10,
                outputTokens: 4,
            },
        })

        const result = await service.generateText({
            prompt: '텍스트를 생성해줘',
        })

        expect(result).toMatchObject({
            text: '생성된 텍스트',
            model: LLM_MODEL.GPT_5_4_MINI,
            usage: {
                inputTokens: 10,
                outputTokens: 4,
            },
        })
        expect(result.ttlbMs).toEqual(expect.any(Number))
        expect(openAiGenerate).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: LLM_PROVIDER.OPENAI,
                model: LLM_MODEL.GPT_5_4_MINI,
                prompt: '텍스트를 생성해줘',
            }),
        )
    })

    it('이미 resolve된 target도 provider와 model 매핑이 맞지 않으면 호출하지 않는다', async () => {
        await expect(
            service.generateObjectWithResolvedTarget({
                prompt: '요약해줘',
                schema: z.object({
                    summary: z.string().min(1),
                }),
                target: {
                    provider: LLM_PROVIDER.GEMINI,
                    model: LLM_MODEL.GPT_5_4_MINI,
                },
            }),
        ).rejects.toBeInstanceOf(LlmConfigurationError)

        expect(openAiGenerate).not.toHaveBeenCalled()
        expect(geminiGenerate).not.toHaveBeenCalled()
    })

    it('generateObject는 provider JSON 응답을 schema로 검증해 반환한다', async () => {
        openAiProvider.generate.mockResolvedValueOnce({
            text: '{"summary":"요약"}',
            model: LLM_MODEL.GPT_5_4_MINI,
            usage: {
                inputTokens: 12,
                outputTokens: 5,
            },
        })

        const result = await service.generateObject({
            prompt: '요약해줘',
            schema: z.object({
                summary: z.string().min(1),
            }),
            responseSchemaName: 'summary_result',
        })

        expect(result).toMatchObject({
            model: LLM_MODEL.GPT_5_4_MINI,
            data: {
                summary: '요약',
            },
            usage: {
                inputTokens: 12,
                outputTokens: 5,
            },
        })
        expect(result.ttlbMs).toEqual(expect.any(Number))
        const providerInput =
            getFirstCallArg<LlmProviderGenerateInput>(openAiGenerate)

        expect(providerInput).toMatchObject({
            provider: LLM_PROVIDER.OPENAI,
            model: LLM_MODEL.GPT_5_4_MINI,
            prompt: '요약해줘',
            responseFormat: {
                name: 'summary_result',
            },
        })
        expect(providerInput.responseFormat?.schema).toMatchObject({
            type: 'object',
            additionalProperties: false,
            required: ['summary'],
        })
    })

    it('generateObject는 optional 필드를 provider 요청 전에 거부한다', async () => {
        const result = service.generateObject({
            prompt: '요약해줘',
            schema: z.object({
                summary: z.string().optional(),
            }),
        })

        await expect(result).rejects.toBeInstanceOf(LlmConfigurationError)
        await expect(result).rejects.toHaveProperty('cause', expect.any(Error))
        expect(openAiGenerate).not.toHaveBeenCalled()
    })

    it('generateObject는 nullable 필드를 required schema로 변환한다', async () => {
        openAiProvider.generate.mockResolvedValueOnce({
            text: '{"summary":null}',
        })

        await service.generateObject({
            prompt: '요약해줘',
            schema: z.object({
                summary: z.string().nullable(),
            }),
        })

        const providerInput =
            getFirstCallArg<LlmProviderGenerateInput>(openAiGenerate)

        expect(providerInput.responseFormat?.schema).toMatchObject({
            required: ['summary'],
            properties: {
                summary: {
                    anyOf: [{ type: 'string' }, { type: 'null' }],
                },
            },
        })
    })

    it('generateObject는 provider 응답이 JSON이 아니면 parse 오류를 던진다', async () => {
        openAiProvider.generate.mockResolvedValueOnce({
            text: '요약',
        })

        const result = service.generateObject({
            prompt: '요약해줘',
            schema: z.object({
                summary: z.string().min(1),
            }),
        })

        await expect(result).rejects.toBeInstanceOf(LlmResponseParseError)
        await expect(result).rejects.toHaveProperty(
            'cause',
            expect.any(SyntaxError),
        )
    })

    it('generateObject는 JSON이 schema를 만족하지 않으면 ZodError를 던진다', async () => {
        openAiProvider.generate.mockResolvedValueOnce({
            text: '{"tags":[]}',
        })

        await expect(
            service.generateObject({
                prompt: '요약해줘',
                schema: z.object({
                    summary: z.string().min(1),
                }),
            }),
        ).rejects.toBeInstanceOf(z.ZodError)
    })
})

function getFirstCallArg<T>(mock: jest.Mock): T {
    const firstCall = (mock.mock.calls as Array<[T]>)[0]

    if (!firstCall) {
        throw new Error('mock이 호출되지 않았습니다.')
    }

    return firstCall[0]
}
