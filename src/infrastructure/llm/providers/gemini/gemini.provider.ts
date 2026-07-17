import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
    GenerateContentConfig,
    GenerateContentParameters,
    GenerateContentResponse,
} from '@google/genai'
import { ApiError, FinishReason, GoogleGenAI } from '@google/genai'

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
    GEMINI_ERROR_CODE,
    GEMINI_MAX_ATTEMPTS,
    GEMINI_RESPONSE_MIME_TYPE,
} from './gemini.constants'

type GeminiClient = Pick<GoogleGenAI, 'models'>

@Injectable()
export class GeminiProvider implements LlmProvider {
    readonly name = LLM_PROVIDER.GEMINI

    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    async generate(
        input: LlmProviderGenerateInput,
    ): Promise<LlmProviderGenerateResult> {
        const apiKey = this.config.get('GEMINI_API_KEY', { infer: true })

        if (!apiKey) {
            throw new LlmConfigurationError(
                'GEMINI_API_KEY 환경변수가 필요합니다.',
            )
        }

        const client = this.createClient(apiKey)
        const response = await this.generateContent(client, input)

        if (response.promptFeedback?.blockReason) {
            throw new LlmProviderError(
                this.name,
                GEMINI_ERROR_CODE.PROMPT_BLOCKED,
                response.promptFeedback.blockReasonMessage ??
                    `Gemini 요청이 차단되었습니다: ${response.promptFeedback.blockReason}`,
            )
        }

        return {
            text: this.extractText(response),
            model: response.modelVersion ?? input.model,
            usage: {
                inputTokens: response.usageMetadata?.promptTokenCount,
                outputTokens: response.usageMetadata?.candidatesTokenCount,
            },
        }
    }

    protected createClient(apiKey: string): GeminiClient {
        return new GoogleGenAI({
            apiKey,
            httpOptions: {
                retryOptions: {
                    attempts: GEMINI_MAX_ATTEMPTS,
                },
            },
        })
    }

    private async generateContent(
        client: GeminiClient,
        input: LlmProviderGenerateInput,
    ) {
        try {
            return await client.models.generateContent(this.buildRequest(input))
        } catch (error) {
            this.throwProviderError(error)
        }
    }

    private buildRequest(
        input: LlmProviderGenerateInput,
    ): GenerateContentParameters {
        const options = this.getOptions(input)
        const config = this.buildConfig(input, options)

        return {
            model: input.model,
            contents: input.prompt,
            config,
        }
    }

    private buildConfig(
        input: LlmProviderGenerateInput,
        options: LlmGenerationOptions | undefined,
    ): GenerateContentConfig {
        return {
            systemInstruction: input.system,
            temperature: options?.temperature,
            maxOutputTokens: options?.maxOutputTokens,
            topP: options?.topP,
            responseMimeType: input.responseFormat
                ? GEMINI_RESPONSE_MIME_TYPE.JSON
                : undefined,
            responseJsonSchema: input.responseFormat?.schema,
            httpOptions: {
                timeout: this.getTimeoutMs(),
            },
        }
    }

    private getOptions(
        input: LlmProviderGenerateInput,
    ): LlmGenerationOptions | undefined {
        if (input.provider !== this.name) {
            throw new LlmConfigurationError(
                `Gemini provider에 ${input.provider} 요청이 전달되었습니다.`,
            )
        }

        return input.options
    }

    private getTimeoutMs() {
        return this.config.get('LLM_REQUEST_TIMEOUT_MS', { infer: true })
    }

    private throwProviderError(error: unknown): never {
        if (error instanceof ApiError) {
            throw new LlmProviderError(
                this.name,
                GEMINI_ERROR_CODE.REQUEST_FAILED,
                error.message || 'Gemini 요청에 실패했습니다.',
                error.status,
                { cause: error },
            )
        }

        const message = error instanceof Error ? error.message : String(error)

        throw new LlmProviderError(
            this.name,
            GEMINI_ERROR_CODE.REQUEST_FAILED,
            `Gemini 요청에 실패했습니다: ${message}`,
            undefined,
            { cause: error },
        )
    }

    private extractText(body: GenerateContentResponse) {
        const candidate = body.candidates?.[0]
        const finishReason = candidate?.finishReason

        if (finishReason && finishReason !== FinishReason.STOP) {
            throw new LlmProviderError(
                this.name,
                `GEMINI_FINISH_${finishReason}`,
                candidate.finishMessage ??
                    `Gemini 응답이 정상 종료되지 않았습니다: ${finishReason}`,
            )
        }

        if (!body.text) {
            throw new LlmProviderError(
                this.name,
                GEMINI_ERROR_CODE.EMPTY_RESPONSE,
                'Gemini 응답에서 텍스트를 찾을 수 없습니다.',
            )
        }

        return body.text
    }
}
