import { AiTaskType } from './ai.constants'

type AiGenerationErrorInput = {
    code: string
    message: string
    taskType: AiTaskType
    retryable: boolean
    cause?: unknown
}

/**
 * AI module이 외부로 던지는 generation 실패 에러.
 * taskType, 내부 실패 code, 원본 cause를 함께 전달한다.
 * retryable은 provider 응답을 해석한 결과로, 호출부가 provider 예외 타입을 알지 않고도
 * 재시도 여부를 판단할 수 있게 한다.
 */
export class AiGenerationError extends Error {
    readonly code: string
    readonly taskType: AiTaskType
    readonly retryable: boolean

    constructor(input: AiGenerationErrorInput) {
        super(input.message, { cause: input.cause })
        this.name = AiGenerationError.name
        this.code = input.code
        this.taskType = input.taskType
        this.retryable = input.retryable
    }
}
