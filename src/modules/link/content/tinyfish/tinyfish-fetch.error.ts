type TinyFishFetchErrorInput = {
    message: string
    retryable: boolean
    cause?: unknown
}

// HTTP 응답 형식과 분리된 내부 연동 예외다. API 응답에서는 LinkContentService가
// BaseException으로 변환하고, 비동기 분석에서는 retryable로 재시도 여부를 결정한다.
export class TinyFishFetchError extends Error {
    readonly retryable: boolean

    constructor(input: TinyFishFetchErrorInput) {
        super(input.message, { cause: input.cause })
        this.name = TinyFishFetchError.name
        this.retryable = input.retryable
    }
}
