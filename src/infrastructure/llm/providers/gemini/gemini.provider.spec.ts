import { ConfigService } from '@nestjs/config'
import type {
    GenerateContentParameters,
    GenerateContentResponse,
    GoogleGenAI,
} from '@google/genai'
import { ApiError, FinishReason } from '@google/genai'

import { LLM_MODEL } from '../../../../common/constants/llm'
import { ValidatedEnvironment } from '../../../../config/environment'
import { LlmProviderError } from '../../llm.exception'

import { GeminiProvider } from './gemini.provider'

type GeminiClientMock = Pick<GoogleGenAI, 'models'>
type GenerateContentMock = jest.Mock<
    Promise<GenerateContentResponse>,
    [request: GenerateContentParameters]
>

class TestGeminiProvider extends GeminiProvider {
    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly client: GeminiClientMock,
    ) {
        super(config)
    }

    protected override createClient(_apiKey: string) {
        return this.client
    }
}

describe('GeminiProvider', () => {
    let provider: GeminiProvider
    let generateContentMock: GenerateContentMock

    beforeEach(() => {
        const config = {
            get: jest.fn((key: string) => {
                if (key === 'GEMINI_API_KEY') {
                    return 'gemini-api-key'
                }

                if (key === 'LLM_REQUEST_TIMEOUT_MS') {
                    return 1000
                }

                return undefined
            }),
        }

        generateContentMock = jest.fn() as GenerateContentMock
        provider = new TestGeminiProvider(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            {
                models: {
                    generateContent: generateContentMock,
                },
            } as unknown as GeminiClientMock,
        )
    })

    it('공통 options를 generation config 요청 필드로 변환한다', async () => {
        generateContentMock.mockResolvedValueOnce(
            createGeminiResponse({
                text: 'ok',
                candidates: [
                    {
                        finishReason: FinishReason.STOP,
                    },
                ],
            }),
        )

        await provider.generate({
            provider: 'gemini',
            model: LLM_MODEL.GEMINI_3_5_FLASH,
            prompt: '요약해줘',
            options: {
                temperature: 0.3,
                maxOutputTokens: 128,
                topP: 0.8,
            },
        })

        const request = generateContentMock.mock.calls[0]?.[0]

        expect(request).toMatchObject({
            model: LLM_MODEL.GEMINI_3_5_FLASH,
            contents: '요약해줘',
            config: {
                temperature: 0.3,
                maxOutputTokens: 128,
                topP: 0.8,
                httpOptions: {
                    timeout: 1000,
                },
            },
        })
        expect(request?.config?.httpOptions).not.toHaveProperty('retryOptions')
    })

    it('responseFormat을 Gemini JSON schema 형식으로 변환한다', async () => {
        generateContentMock.mockResolvedValueOnce(
            createGeminiResponse({
                text: '{"summary":"ok"}',
                candidates: [
                    {
                        finishReason: FinishReason.STOP,
                    },
                ],
            }),
        )

        await provider.generate({
            provider: 'gemini',
            model: LLM_MODEL.GEMINI_3_5_FLASH,
            prompt: '요약해줘',
            responseFormat: {
                name: 'summary_result',
                schema: {
                    type: 'object',
                    properties: {
                        summary: {
                            type: 'string',
                        },
                    },
                    required: ['summary'],
                },
            },
        })

        const request = generateContentMock.mock.calls[0]?.[0]

        expect(request?.config).toMatchObject({
            responseMimeType: 'application/json',
            responseJsonSchema: {
                type: 'object',
            },
        })
    })

    it('SDK ApiError는 LlmProviderError로 변환하고 cause를 보존한다', async () => {
        const apiError = new ApiError({
            message: 'server failed',
            status: 500,
        })

        generateContentMock.mockRejectedValueOnce(apiError)

        const result = provider.generate({
            provider: 'gemini',
            model: LLM_MODEL.GEMINI_3_5_FLASH,
            prompt: '요약해줘',
        })

        await expect(result).rejects.toBeInstanceOf(LlmProviderError)
        await expect(result).rejects.toMatchObject({
            code: 'GEMINI_REQUEST_FAILED',
            statusCode: 500,
        })
        await expect(result).rejects.toHaveProperty('cause', apiError)
    })
})

function createGeminiResponse(body: Partial<GenerateContentResponse>) {
    return body as GenerateContentResponse
}
