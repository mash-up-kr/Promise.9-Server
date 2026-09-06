import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'

import { AI_TASK_TYPE } from '../../ai/ai.constants'
import { AiGenerationError } from '../../ai/ai.exception'
import { TinyFishFetchError } from '../content/tinyfish/tinyfish-fetch.error'

import { classifyFailure } from './link-analysis.failure'

function aiError(retryable: boolean): AiGenerationError {
    return new AiGenerationError({
        code: 'TEST_ERROR',
        message: 'ai failed',
        taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
        retryable,
    })
}

describe('classifyFailure', () => {
    it('AI 실패는 AiService가 판단한 retryable을 따른다', () => {
        expect(classifyFailure(aiError(true))).toBe('RETRYABLE')
        expect(classifyFailure(aiError(false))).toBe('PERMANENT')
    })

    it('HttpException은 status로 분류하고 4xx만 영구 실패로 본다', () => {
        expect(classifyFailure(new NotFoundException())).toBe('PERMANENT')
        expect(classifyFailure(new ServiceUnavailableException())).toBe(
            'RETRYABLE',
        )
    })

    it('TinyFish 실패는 client가 판단한 retryable을 따른다', () => {
        expect(
            classifyFailure(
                new TinyFishFetchError({
                    message: 'timeout',
                    retryable: true,
                }),
            ),
        ).toBe('RETRYABLE')
        expect(
            classifyFailure(
                new TinyFishFetchError({
                    message: 'invalid',
                    retryable: false,
                }),
            ),
        ).toBe('PERMANENT')
    })

    it('status를 알 수 없는 실패는 재시도한다', () => {
        expect(classifyFailure(new Error('socket hang up'))).toBe('RETRYABLE')
    })
})
