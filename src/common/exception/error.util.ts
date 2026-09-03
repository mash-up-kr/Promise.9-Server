// unknown 타입 오류에서 로그에 쓸 메시지와 stack을 꺼낸다.
// catch 블록마다 같은 삼항 연산을 반복하지 않도록 여기로 모았다.
export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function describeErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined
}
