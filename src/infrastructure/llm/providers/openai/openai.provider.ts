import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI, { APIError } from 'openai'
import type {
    Response as OpenAiResponse,
    ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'

import { ValidatedEnvironment } from '../../../../config/environment'
import { LLM_PROVIDER } from '../../llm.constants'
import { LlmConfigurationError, LlmProviderError } from '../../llm.exception'
import {
    LlmGenerationOptions,
    LlmProvider,
    LlmProviderGenerateInput,
    LlmProviderGenerateResult,
} from '../../llm.type'

import {
    OPENAI_ERROR_CODE,
    OPENAI_MAX_RETRIES,
    OPENAI_OUTPUT_CONTENT_TYPE,
    OPENAI_RESPONSE_FORMAT_TYPE,
    OPENAI_RESPONSE_STATUS,
} from './openai.constants'

type OpenAiClient = Pick<OpenAI, 'responses'>

@Injectable()
export class OpenAiProvider implements LlmProvider {
    readonly name = LLM_PROVIDER.OPENAI

    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    async generate(
        input: LlmProviderGenerateInput,
    ): Promise<LlmProviderGenerateResult> {
        const apiKey = this.config.get('OPENAI_API_KEY', { infer: true })

        if (!apiKey) {
            throw new LlmConfigurationError(
                'OPENAI_API_KEY 환경변수가 필요합니다.',
            )
        }

        const client = this.createClient(apiKey)
        const response = await this.createResponse(client, input)

        return {
            text: this.extractText(response),
            model: response.model ?? input.model,
            usage: {
                inputTokens: response.usage?.input_tokens,
                outputTokens: response.usage?.output_tokens,
            },
        }
    }

    protected createClient(apiKey: string): OpenAiClient {
        return new OpenAI({
            apiKey,
        })
    }

    private async createResponse(
        client: OpenAiClient,
        input: LlmProviderGenerateInput,
    ) {
        try {
            return await client.responses.create(this.buildRequestBody(input), {
                maxRetries: OPENAI_MAX_RETRIES,
                timeout: this.getTimeoutMs(),
            })
        } catch (error) {
            this.throwProviderError(error)
        }
    }

    private buildRequestBody(
        input: LlmProviderGenerateInput,
    ): ResponseCreateParamsNonStreaming {
        const options = this.getOptions(input)

        return {
            model: input.model,
            instructions: input.system,
            input: input.prompt,
            temperature: options?.temperature,
            max_output_tokens: options?.maxOutputTokens,
            top_p: options?.topP,
            stream: false,
            text: input.responseFormat
                ? {
                      format: {
                          type: OPENAI_RESPONSE_FORMAT_TYPE.JSON_SCHEMA,
                          name: input.responseFormat.name,
                          schema: input.responseFormat.schema,
                          strict: true,
                      },
                  }
                : undefined,
        }
    }

    private getOptions(
        input: LlmProviderGenerateInput,
    ): LlmGenerationOptions | undefined {
        if (input.provider !== this.name) {
            throw new LlmConfigurationError(
                `OpenAI provider에 ${input.provider} 요청이 전달되었습니다.`,
            )
        }

        return input.options
    }

    private getTimeoutMs() {
        return this.config.get('LLM_REQUEST_TIMEOUT_MS', { infer: true })
    }

    private throwProviderError(error: unknown): never {
        if (error instanceof APIError) {
            const statusCode =
                typeof error.status === 'number' ? error.status : undefined

            throw new LlmProviderError(
                this.name,
                error.code ?? OPENAI_ERROR_CODE.REQUEST_FAILED,
                error.message || 'OpenAI 요청에 실패했습니다.',
                statusCode,
                { cause: error },
            )
        }

        const message = error instanceof Error ? error.message : String(error)

        throw new LlmProviderError(
            this.name,
            OPENAI_ERROR_CODE.REQUEST_FAILED,
            `OpenAI 요청에 실패했습니다: ${message}`,
            undefined,
            { cause: error },
        )
    }

    private assertCompleted(body: OpenAiResponse) {
        if (!body.status || body.status === OPENAI_RESPONSE_STATUS.COMPLETED) {
            return
        }

        if (body.status === OPENAI_RESPONSE_STATUS.INCOMPLETE) {
            const reason = body.incomplete_details?.reason ?? 'unknown'

            throw new LlmProviderError(
                this.name,
                `OPENAI_INCOMPLETE_${reason.toUpperCase()}`,
                `OpenAI 응답이 완료되지 않았습니다: ${reason}`,
            )
        }

        throw new LlmProviderError(
            this.name,
            body.error?.code ?? OPENAI_ERROR_CODE.RESPONSE_NOT_COMPLETED,
            body.error?.message ??
                `OpenAI 응답이 완료 상태가 아닙니다: ${body.status}`,
        )
    }

    private extractText(body: OpenAiResponse) {
        this.assertCompleted(body)

        const contents = body.output
            .filter((item) => item.type === 'message')
            .flatMap((item) => item.content)

        const refusal = contents.find(
            (content) => content.type === OPENAI_OUTPUT_CONTENT_TYPE.REFUSAL,
        )

        if (refusal) {
            throw new LlmProviderError(
                this.name,
                OPENAI_ERROR_CODE.REFUSAL,
                refusal.refusal,
            )
        }

        if (body.output_text) {
            return body.output_text
        }

        const text = contents
            .filter(
                (content) =>
                    content.type === OPENAI_OUTPUT_CONTENT_TYPE.OUTPUT_TEXT,
            )
            .map((content) => content.text)
            .join('')

        if (!text) {
            throw new LlmProviderError(
                this.name,
                OPENAI_ERROR_CODE.EMPTY_RESPONSE,
                'OpenAI 응답에서 텍스트를 찾을 수 없습니다.',
            )
        }

        return text
    }
}
