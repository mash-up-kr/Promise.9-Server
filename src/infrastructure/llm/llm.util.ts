import { zodTextFormat } from 'openai/helpers/zod'

import { LlmConfigurationError, LlmResponseParseError } from './llm.exception'
import { LlmObjectSchema } from './llm.type'

export function toProviderJsonSchema<T>(
    schema: LlmObjectSchema<T>,
    schemaName: string,
) {
    try {
        return zodTextFormat(schema, schemaName).schema
    } catch (error) {
        throw new LlmConfigurationError(
            'LLM structured output schema가 provider 공통 규칙을 만족하지 않습니다. 최상위 z.object를 사용하고, 값이 없을 수 있는 필드는 optional 대신 nullable로 정의해야 합니다.',
            { cause: error },
        )
    }
}

export function parseJsonResult(text: string): unknown {
    try {
        return JSON.parse(text) as unknown
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        throw new LlmResponseParseError(
            `LLM 응답 JSON 파싱에 실패했습니다: ${message}`,
            { cause: error },
        )
    }
}
