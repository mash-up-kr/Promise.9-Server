import { HttpException } from '@nestjs/common'

import { AiGenerationError } from '../../ai/ai.exception'

import {
    LinkAnalysisFailureKind,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

// AI 실패는 AiService가 판단한 retryable을 그대로 신뢰한다. provider 예외 타입은
// AI module 안에만 두고, 여기서는 도메인 정책만 다룬다.
// 그 밖의 실패는 status를 알 수 있으면 4xx만 영구 실패로 보고, 나머지는 재시도한다.
export function classifyFailure(error: unknown): LinkAnalysisFailureKind {
    if (error instanceof AiGenerationError) {
        return error.retryable ? 'RETRYABLE' : 'PERMANENT'
    }

    if (error instanceof HttpException) {
        const status = error.getStatus()
        const isClientError = status >= 400 && status < 500

        return isClientError && status !== 429 ? 'PERMANENT' : 'RETRYABLE'
    }

    return 'RETRYABLE'
}

export function isRetryableFailure(
    result: LinkAnalysisTaskResult,
): result is Extract<LinkAnalysisTaskResult, { status: 'FAILED' }> {
    return result.status === 'FAILED' && result.kind === 'RETRYABLE'
}
