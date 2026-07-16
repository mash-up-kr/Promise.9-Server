import { ConfigService } from '@nestjs/config'
import type OpenAI from 'openai'
import { APIError } from 'openai'
import type {
    Response as OpenAiResponse,
    ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'

import { LLM_MODEL } from '../../../../common/constants/llm'
import { ValidatedEnvironment } from '../../../../config/environment'
import { LlmProviderError } from '../../llm.exception'

import { OPENAI_RESPONSE_STATUS } from './openai.constants'
import { OpenAiProvider } from './openai.provider'

type OpenAiClientMock = Pick<OpenAI, 'responses'>
type OpenAiCreateMock = jest.Mock<
    Promise<OpenAiResponse>,
    [
        body: ResponseCreateParamsNonStreaming,
        options?: {
            maxRetries?: number
            timeout?: number
        },
    ]
>

class TestOpenAiProvider extends OpenAiProvider {
    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly client: OpenAiClientMock,
    ) {
        super(config)
    }

    protected override createClient(_apiKey: string) {
        return this.client
    }
}

describe('OpenAiProvider', () => {
    let provider: OpenAiProvider
    let responseCreateMock: OpenAiCreateMock

    beforeEach(() => {
        const config = {
            get: jest.fn((key: string) => {
                if (key === 'OPENAI_API_KEY') {
                    return 'openai-api-key'
                }

                if (key === 'LLM_REQUEST_TIMEOUT_MS') {
                    return 1000
                }

                return undefined
            }),
        }

        responseCreateMock = jest.fn() as OpenAiCreateMock
        provider = new TestOpenAiProvider(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            {
                responses: {
                    create: responseCreateMock,
                },
            } as unknown as OpenAiClientMock,
        )
    })

    it('completed가 아닌 응답 상태는 성공으로 처리하지 않는다', async () => {
        responseCreateMock.mockResolvedValueOnce(
            createOpenAiResponse({
                status: OPENAI_RESPONSE_STATUS.FAILED,
                error: {
                    code: 'server_error',
                    message: 'model failed',
                },
                output_text: 'ignored',
            }),
        )

        await expect(
            provider.generate({
                provider: 'openai',
                model: LLM_MODEL.GPT_5_4_MINI,
                prompt: '요약해줘',
            }),
        ).rejects.toMatchObject({
            code: 'server_error',
            message: 'model failed',
        })
    })

    it('SDK APIError는 LlmProviderError로 변환한다', async () => {
        const apiError = new APIError(
            500,
            {
                code: 'server_error',
                message: 'server failed',
            },
            'server failed',
            new Headers(),
        )

        responseCreateMock.mockRejectedValueOnce(apiError)

        const result = provider.generate({
            provider: 'openai',
            model: LLM_MODEL.GPT_5_4_MINI,
            prompt: '요약해줘',
        })

        await expect(result).rejects.toBeInstanceOf(LlmProviderError)
        await expect(result).rejects.toMatchObject({
            code: 'server_error',
            statusCode: 500,
        })
        await expect(result).rejects.toHaveProperty('cause', apiError)
    })

    it('공통 options를 Responses API 요청 필드로 변환한다', async () => {
        responseCreateMock.mockResolvedValueOnce(
            createOpenAiResponse({
                status: OPENAI_RESPONSE_STATUS.COMPLETED,
                output_text: 'ok',
            }),
        )

        await provider.generate({
            provider: 'openai',
            model: LLM_MODEL.GPT_5_4_MINI,
            prompt: '요약해줘',
            options: {
                temperature: 0.2,
                maxOutputTokens: 128,
                topP: 0.9,
            },
        })

        const body = responseCreateMock.mock.calls[0]?.[0]
        const options = responseCreateMock.mock.calls[0]?.[1]

        expect(body).toMatchObject({
            temperature: 0.2,
            max_output_tokens: 128,
            top_p: 0.9,
            stream: false,
        })
        expect(options).toMatchObject({
            maxRetries: 1,
            timeout: 1000,
        })
    })

    it('responseFormat을 Responses API structured output 형식으로 변환한다', async () => {
        responseCreateMock.mockResolvedValueOnce(
            createOpenAiResponse({
                status: OPENAI_RESPONSE_STATUS.COMPLETED,
                output_text: '{"summary":"ok"}',
            }),
        )

        await provider.generate({
            provider: 'openai',
            model: LLM_MODEL.GPT_5_4_MINI,
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

        const body = responseCreateMock.mock.calls[0]?.[0]

        expect(body?.text).toMatchObject({
            format: {
                type: 'json_schema',
                name: 'summary_result',
                strict: true,
            },
        })
    })
})

function createOpenAiResponse(body: Partial<OpenAiResponse>) {
    return {
        id: 'resp_test',
        created_at: 0,
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        model: 'gpt-test',
        object: 'response',
        output: [],
        output_text: '',
        parallel_tool_calls: false,
        temperature: null,
        tool_choice: 'auto',
        tools: [],
        top_p: null,
        ...body,
    } as OpenAiResponse
}
