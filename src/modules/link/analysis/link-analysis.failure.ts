import { HttpException } from '@nestjs/common'

import {
    LlmConfigurationError,
    LlmProviderError,
} from '../../../infrastructure/llm/llm.exception'

import {
    LinkAnalysisFailureKind,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

// AiService는 원본 오류를 AiGenerationError의 cause에 담아 던지므로 체인을 따라가야
// provider가 남긴 HTTP status를 볼 수 있다. 순환 cause에 대비해 깊이를 제한한다.
const MAX_CAUSE_DEPTH = 5

// 4xx는 같은 입력으로 다시 호출해도 결과가 같아 재시도하지 않는다.
// 429는 일시적인 사용량 제한이므로 예외로 두고 재시도한다.
// 네트워크 오류·타임아웃·5xx는 status가 없거나 5xx이므로 재시도 대상이 된다.
export function classifyFailure(error: unknown): LinkAnalysisFailureKind {
    for (const current of causeChain(error)) {
        if (current instanceof HttpException) {
            return classifyStatus(current.getStatus())
        }

        if (
            current instanceof LlmProviderError &&
            current.statusCode !== undefined
        ) {
            return classifyStatus(current.statusCode)
        }

        // API 키 누락·잘못된 모델 지정은 재시도해도 같은 결과다.
        if (current instanceof LlmConfigurationError) {
            return 'PERMANENT'
        }
    }

    return 'RETRYABLE'
}

function classifyStatus(status: number): LinkAnalysisFailureKind {
    const isClientError = status >= 400 && status < 500

    return isClientError && status !== 429 ? 'PERMANENT' : 'RETRYABLE'
}

function* causeChain(error: unknown): Generator<unknown> {
    let current = error

    for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
        yield current
        current = current instanceof Error ? current.cause : undefined
    }
}

export function isRetryableFailure(
    result: LinkAnalysisTaskResult,
): result is Extract<LinkAnalysisTaskResult, { status: 'FAILED' }> {
    return result.status === 'FAILED' && result.kind === 'RETRYABLE'
}

export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function describeErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined
}
