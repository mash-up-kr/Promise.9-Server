import { AiTaskType } from './ai.constants'

type AiGenerationErrorInput = {
    code: string
    message: string
    taskType: AiTaskType
    cause?: unknown
}

/**
 * AI module이 외부로 던지는 generation 실패 에러.
 * taskType, 내부 실패 code, 원본 cause를 함께 전달한다.
 */
export class AiGenerationError extends Error {
    readonly code: string
    readonly taskType: AiTaskType

    constructor(input: AiGenerationErrorInput) {
        super(input.message, { cause: input.cause })
        this.name = AiGenerationError.name
        this.code = input.code
        this.taskType = input.taskType
    }
}
