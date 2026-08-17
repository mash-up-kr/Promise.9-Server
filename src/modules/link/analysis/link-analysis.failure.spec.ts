import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'

import {
    LlmConfigurationError,
    LlmProviderError,
} from '../../../infrastructure/llm/llm.exception'
import { AI_TASK_TYPE } from '../../ai/ai.constants'
import { AiGenerationError } from '../../ai/ai.exception'

import { classifyFailure } from './link-analysis.failure'

function aiError(cause: unknown): AiGenerationError {
    return new AiGenerationError({
        code: 'TEST_ERROR',
        message: 'ai failed',
        taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
        cause,
    })
}

describe('classifyFailure', () => {
    it('status를 알 수 없는 실패는 재시도한다', () => {
        expect(classifyFailure(new Error('socket hang up'))).toBe('RETRYABLE')
    })

    it('AiGenerationError의 cause를 따라가 provider status로 분류한다', () => {
        const unauthorized = aiError(
            new LlmProviderError('openai', 'invalid_api_key', '키 오류', 401),
        )
        const overloaded = aiError(
            new LlmProviderError('openai', 'server_error', '서버 오류', 503),
        )

        expect(classifyFailure(unauthorized)).toBe('PERMANENT')
        expect(classifyFailure(overloaded)).toBe('RETRYABLE')
    })

    it('타임아웃처럼 status가 없는 provider 오류는 재시도한다', () => {
        const timeout = aiError(
            new LlmProviderError('openai', 'timeout', '요청 시간 초과'),
        )

        expect(classifyFailure(timeout)).toBe('RETRYABLE')
    })

    it('429는 일시적 제한이므로 재시도한다', () => {
        const rateLimited = aiError(
            new LlmProviderError('gemini', 'rate_limit', '한도 초과', 429),
        )

        expect(classifyFailure(rateLimited)).toBe('RETRYABLE')
    })

    it('설정 오류는 재시도해도 같은 결과라 재시도하지 않는다', () => {
        expect(
            classifyFailure(aiError(new LlmConfigurationError('키 없음'))),
        ).toBe('PERMANENT')
    })

    it('HttpException은 status로 분류한다', () => {
        expect(classifyFailure(new NotFoundException())).toBe('PERMANENT')
        expect(classifyFailure(new ServiceUnavailableException())).toBe(
            'RETRYABLE',
        )
    })

    it('cause가 순환해도 무한 루프에 빠지지 않는다', () => {
        const first = new Error('first')
        const second = new Error('second', { cause: first })
        first.cause = second

        expect(classifyFailure(first)).toBe('RETRYABLE')
    })
})
