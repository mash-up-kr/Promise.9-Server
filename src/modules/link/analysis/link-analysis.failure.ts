import { HttpException } from '@nestjs/common'

import {
    LinkAnalysisFailureKind,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

// 4xx는 같은 입력으로 다시 호출해도 결과가 같아 재시도하지 않는다.
// 429는 일시적인 사용량 제한이므로 예외로 두고 재시도한다.
// 네트워크 오류·타임아웃·5xx·provider 내부 오류는 모두 재시도 대상으로 본다.
export function classifyFailure(error: unknown): LinkAnalysisFailureKind {
    if (error instanceof HttpException) {
        const status = error.getStatus()

        if (status >= 400 && status < 500 && status !== 429) {
            return 'PERMANENT'
        }
    }

    return 'RETRYABLE'
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
