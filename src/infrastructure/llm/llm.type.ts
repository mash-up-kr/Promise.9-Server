import { z } from 'zod'

import type { LlmModelName } from '../../common/constants/llm'

import type { LlmProviderName } from './llm.constants'

export type { LlmModelName } from '../../common/constants/llm'
export type { LlmProviderName } from './llm.constants'

export type LlmUsage = {
    inputTokens?: number
    outputTokens?: number
}

export type LlmGeneratedModel = {
    model: string
}

export type LlmGenerationOptions = {
    temperature?: number
    maxOutputTokens?: number
    topP?: number
}

export type LlmTargetOptions = {
    model: LlmModelName
    options?: LlmGenerationOptions
}

export type LlmResolvedTarget = LlmTargetOptions & {
    provider: LlmProviderName
}

export type LlmPromptInput = {
    system?: string
    prompt: string
}

export type LlmGenerateTextInput = LlmPromptInput & {
    target?: LlmTargetOptions
}

export type LlmObjectSchema<T> = z.ZodObject & z.ZodType<T>

export type LlmGenerateObjectInput<T> = LlmGenerateTextInput & {
    schema: LlmObjectSchema<T>
    responseSchemaName?: string
}

/**
 * Public text 생성 입력에서 target만 이미 resolve된 값으로 바꾼 내부 호출 입력.
 * metrics 기록과 provider 호출이 같은 provider/model을 사용해야 하는 경로에서 쓴다.
 */
export type LlmGenerateTextWithResolvedTargetInput = Omit<
    LlmGenerateTextInput,
    'target'
> & {
    target: LlmResolvedTarget
}

/**
 * Public object 생성 입력에서 target만 이미 resolve된 값으로 바꾼 내부 호출 입력.
 * schema 변환, provider 호출, metrics 기록이 같은 provider/model을 기준으로 움직여야 하는 경로에서 쓴다.
 */
export type LlmGenerateObjectWithResolvedTargetInput<T> = Omit<
    LlmGenerateObjectInput<T>,
    'target'
> & {
    target: LlmResolvedTarget
}

export type LlmResponseFormat = {
    name: string
    schema: Record<string, unknown>
}

export type LlmProviderGenerateInput = LlmPromptInput &
    LlmResolvedTarget & {
        responseFormat?: LlmResponseFormat
    }

export type LlmProviderGenerateResult = {
    text: string
    model?: string
    usage?: LlmUsage
}

export type LlmGenerateTextResult = LlmGeneratedModel & {
    text: string
    usage?: LlmUsage
    ttlbMs: number
}

export type LlmGenerateObjectResult<T> = LlmGeneratedModel & {
    data: T
    usage?: LlmUsage
    ttlbMs: number
}

export interface LlmProvider {
    readonly name: LlmProviderName
    generate(
        input: LlmProviderGenerateInput,
    ): Promise<LlmProviderGenerateResult>
}
