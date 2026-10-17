/** SDK가 AbortSignal을 처리하지 못하는 단계에서도 호출자의 대기를 끝낸다. */
export async function withAnalyticsTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    shutdownSignal: AbortSignal,
): Promise<T> {
    const timeout = new AbortController()
    const signal = AbortSignal.any([shutdownSignal, timeout.signal])
    const timer = setTimeout(
        () =>
            timeout.abort(
                new DOMException('Analytics request timed out', 'TimeoutError'),
            ),
        timeoutMs,
    )
    let onAbort: () => void = () => {}
    try {
        signal.throwIfAborted()
        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason as Error)
            signal.addEventListener('abort', onAbort, { once: true })
        })
        // 늦게 도착한 SDK 응답은 큐를 수정하지 않는다. 재전송 시 event_id로 중복 제거한다.
        return await Promise.race([operation(signal), aborted])
    } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
    }
}
