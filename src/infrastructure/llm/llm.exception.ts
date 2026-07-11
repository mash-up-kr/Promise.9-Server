import { LlmProviderName } from './llm.type'

export const LLM_ERROR_CODE = {
    CONFIGURATION_ERROR: 'LLM_CONFIGURATION_ERROR',
    RESPONSE_PARSE_FAILED: 'LLM_RESPONSE_PARSE_FAILED',
} as const

/**
 * LLM infrastructure 계층에서 발생한 에러의 base class.
 * AiService는 이 타입의 code/message를 AI generation 실패 정보로 변환한다.
 */
export class LlmError extends Error {
    constructor(
        readonly code: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = new.target.name
    }
}

/**
 * provider 호출 전에 알 수 있는 LLM 설정/target/preflight 에러.
 * 실제 LLM 호출 결과가 아니므로 metric 실패 기록 대상에서 제외한다.
 */
export class LlmConfigurationError extends LlmError {
    constructor(message: string, options?: ErrorOptions) {
        super(LLM_ERROR_CODE.CONFIGURATION_ERROR, message, options)
    }
}

/**
 * provider SDK/API 호출 실패를 감싸는 에러.
 * provider, provider error code, HTTP status, 원본 cause를 보존한다.
 */
export class LlmProviderError extends LlmError {
    constructor(
        readonly provider: LlmProviderName,
        code: string,
        message: string,
        readonly statusCode?: number,
        options?: ErrorOptions,
    ) {
        super(code, message, options)
    }
}

/**
 * structured output으로 받은 provider 응답을 JSON으로 해석하지 못한 에러.
 * provider 호출은 끝났지만 응답 형식이 기대와 달라 실패한 경우에 사용한다.
 */
export class LlmResponseParseError extends LlmError {
    constructor(message: string, options?: ErrorOptions) {
        super(LLM_ERROR_CODE.RESPONSE_PARSE_FAILED, message, options)
    }
}
