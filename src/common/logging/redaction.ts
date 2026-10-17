const REDACTED = '[REDACTED]'
const SENSITIVE_KEY =
    /authorization|cookie|password|passwd|secret|token|api.?key|credential|email|^(body|headers|query|params|sql|prompt|completion)$/i

export function sanitizeText(value: string): string {
    return (
        value
            // 수집 대상 링크, OAuth callback, API key 쿼리와 DB URL의 인증정보 제거.
            .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gi, (raw) => {
                try {
                    const url = new URL(raw)
                    url.username = ''
                    url.password = ''
                    url.search = ''
                    url.hash = ''
                    return url.toString()
                } catch {
                    return '[URL]'
                }
            })
            .replace(/(\/[^\s?"'<>]*)\?[^\s"'<>]*/g, `$1?${REDACTED}`)
            .replace(
                /\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=~%-]+/gi,
                `$1 ${REDACTED}`,
            )
            .replace(
                /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
                REDACTED,
            )
            .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
            .replace(
                /((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|password|secret)["']?\s*[=:]\s*["']?)[^\s,"';}\]]+/gi,
                `$1${REDACTED}`,
            )
            // Drizzle의 오류 메시지에 SQL/파라미터가 포함되는 경우가 있다.
            .replace(
                /(Failed query:|\bparams:)[\s\S]*?(?=\n\s+at |$)/gi,
                `$1 ${REDACTED}`,
            )
            .slice(0, 16_384)
    )
}

export function sanitizeLogValue(
    value: unknown,
    seen = new WeakSet<object>(),
    depth = 0,
): unknown {
    if (typeof value === 'string') return sanitizeText(value)
    if (typeof value === 'bigint') return value.toString()
    if (value === null || typeof value !== 'object') return value
    if (depth > 6) return '[Truncated]'
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (value instanceof Error) {
        return {
            type: value.name,
            message: sanitizeText(value.message),
            stack: value.stack && sanitizeText(value.stack),
            ...(value.cause
                ? { cause: sanitizeLogValue(value.cause, seen, depth + 1) }
                : {}),
        }
    }
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value))
        return value
            .slice(0, 50)
            .map((item) => sanitizeLogValue(item, seen, depth + 1))

    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 50)
            .map(([key, item]) => [
                key,
                SENSITIVE_KEY.test(key)
                    ? REDACTED
                    : sanitizeLogValue(item, seen, depth + 1),
            ]),
    )
}
