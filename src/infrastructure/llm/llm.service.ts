import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../config/environment'

import { GeminiProvider } from './providers/gemini/gemini.provider'
import { OpenAiProvider } from './providers/openai/openai.provider'
import {
    LLM_DEFAULT_RESPONSE_SCHEMA_NAME,
    LLM_MODEL_PROVIDER,
    LLM_PROVIDER,
    LlmProviderName,
} from './llm.constants'
import { LlmConfigurationError } from './llm.exception'
import type * as Llm from './llm.type'
import { parseJsonResult, toProviderJsonSchema } from './llm.util'

@Injectable()
export class LlmService {
    private readonly providers: Record<LlmProviderName, Llm.LlmProvider>

    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
        openAiProvider: OpenAiProvider,
        geminiProvider: GeminiProvider,
    ) {
        this.providers = {
            [LLM_PROVIDER.OPENAI]: openAiProvider,
            [LLM_PROVIDER.GEMINI]: geminiProvider,
        }
    }

    resolveTarget(input: {
        target?: Llm.LlmTargetOptions
    }): Llm.LlmResolvedTarget {
        if (!input.target) {
            return this.resolveModelTarget(
                this.config.get('LLM_DEFAULT_MODEL', { infer: true }),
            )
        }

        return this.resolveModelTarget(input.target.model, input.target.options)
    }

    private resolveModelTarget(
        model: Llm.LlmModelName,
        options?: Llm.LlmGenerationOptions,
    ): Llm.LlmResolvedTarget {
        const provider = this.resolveModelProvider(model)

        return {
            provider,
            model,
            options: options,
        }
    }

    private resolveModelProvider(model: string): LlmProviderName {
        const provider = (
            LLM_MODEL_PROVIDER as Partial<Record<string, LlmProviderName>>
        )[model]

        if (!provider) {
            throw new LlmConfigurationError(
                `지원하지 않는 LLM model입니다: ${model}`,
            )
        }

        return provider
    }

    async generateText(
        input: Llm.LlmGenerateTextInput,
    ): Promise<Llm.LlmGenerateTextResult> {
        const target = this.resolveTarget(input)

        return this.generateTextWithResolvedTarget({
            ...input,
            target,
        })
    }

    async generateTextWithResolvedTarget(
        input: Llm.LlmGenerateTextWithResolvedTargetInput,
    ): Promise<Llm.LlmGenerateTextResult> {
        const { target } = input
        this.assertResolvedTarget(target)

        const provider = this.providers[target.provider]
        const startedAt = performance.now()

        const result = await provider.generate({
            system: input.system,
            prompt: input.prompt,
            ...target,
        })

        return {
            ...result,
            model: result.model ?? target.model,
            ttlbMs: this.getElapsedMs(startedAt),
        }
    }

    async generateObject<T>(
        input: Llm.LlmGenerateObjectInput<T>,
    ): Promise<Llm.LlmGenerateObjectResult<T>> {
        const target = this.resolveTarget(input)

        return this.generateObjectWithResolvedTarget({
            ...input,
            target,
        })
    }

    /**
     * 이미 resolve한 target으로 metrics 기록과 실제 provider 호출을 맞춰야 하는 내부 조율용 경로.
     */
    async generateObjectWithResolvedTarget<T>(
        input: Llm.LlmGenerateObjectWithResolvedTargetInput<T>,
    ): Promise<Llm.LlmGenerateObjectResult<T>> {
        const { target } = input
        this.assertResolvedTarget(target)

        const provider = this.providers[target.provider]
        const startedAt = performance.now()
        const responseSchemaName =
            input.responseSchemaName ?? LLM_DEFAULT_RESPONSE_SCHEMA_NAME
        const responseSchema = toProviderJsonSchema(
            input.schema,
            responseSchemaName,
        )
        const request: Llm.LlmProviderGenerateInput = {
            system: input.system,
            prompt: input.prompt,
            ...target,
            responseFormat: {
                name: responseSchemaName,
                schema: responseSchema,
            },
        }

        const result = await provider.generate(request)
        const parsed = parseJsonResult(result.text)

        return {
            model: result.model ?? target.model,
            data: input.schema.parse(parsed),
            usage: result.usage,
            ttlbMs: this.getElapsedMs(startedAt),
        }
    }

    private getElapsedMs(startedAt: number) {
        return Math.round(performance.now() - startedAt)
    }

    private assertResolvedTarget(target: Llm.LlmResolvedTarget) {
        const expectedProvider = this.resolveModelProvider(target.model)

        if (target.provider === expectedProvider) {
            return
        }

        throw new LlmConfigurationError(
            `LLM target provider가 model과 일치하지 않습니다: model=${target.model}, provider=${target.provider}, expectedProvider=${expectedProvider}`,
        )
    }
}
