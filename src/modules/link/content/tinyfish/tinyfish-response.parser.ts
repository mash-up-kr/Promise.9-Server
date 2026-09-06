import { TinyFishFetchError } from './tinyfish-fetch.error'

export type TinyFishResponseContent = {
    title: string | null
    description: string | null
    content: string | null
    imageLinks: readonly string[]
}

export type TinyFishResponseOutcome =
    | { status: 'SUCCESS'; content: TinyFishResponseContent }
    | { status: 'UNAVAILABLE'; reason: string }

export function parseTinyFishResponse(value: unknown): TinyFishResponseOutcome {
    if (!value || typeof value !== 'object') {
        throw new TinyFishFetchError({
            message: 'TinyFish 응답 형식이 올바르지 않습니다.',
            retryable: true,
        })
    }

    const response = value as Record<string, unknown>
    const results = toUnknownArray(response.results)
    const errors = toUnknownArray(response.errors)
    const result = results[0]

    if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>
        const imageLinks = Array.isArray(record.image_links)
            ? record.image_links.filter(
                  (image): image is string => typeof image === 'string',
              )
            : []

        return {
            status: 'SUCCESS',
            content: {
                title: normalizeTinyFishText(record.title),
                description: normalizeTinyFishText(record.description),
                content: normalizeTinyFishText(record.text),
                imageLinks,
            },
        }
    }

    const failure = errors[0]
    if (!failure || typeof failure !== 'object') {
        throw new TinyFishFetchError({
            message: 'TinyFish 결과가 비어 있습니다.',
            retryable: true,
        })
    }

    const { error, status } = failure as Record<string, unknown>
    const code = typeof error === 'string' ? error : 'unknown'
    const upstreamStatus = typeof status === 'number' ? status : undefined

    if (isRetryableTinyFishError(code, upstreamStatus)) {
        throw new TinyFishFetchError({
            message: `TinyFish URL 수집 실패: ${code}`,
            retryable: true,
        })
    }

    return { status: 'UNAVAILABLE', reason: `TinyFish URL 수집 불가: ${code}` }
}

function toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? (value as unknown[]) : []
}

function normalizeTinyFishText(value: unknown): string | null {
    if (typeof value !== 'string') return null

    const lines = decodeHtmlEntities(value)
        .split('\u0000')
        .join('\uFFFD')
        .split('\n')
        .map((line) => line.trimEnd())
    const deduplicated = lines.filter(
        (line, index) => !line || line !== lines[index - 1],
    )
    const normalized = deduplicated
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    return normalized || null
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(?:39|x27);/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_entity, code: string) =>
            decodeCodePoint(code, 16),
        )
        .replace(/&#(\d+);/g, (_entity, code: string) =>
            decodeCodePoint(code, 10),
        )
}

function decodeCodePoint(code: string, radix: number): string {
    const codePoint = Number.parseInt(code, radix)

    if (
        !Number.isSafeInteger(codePoint) ||
        codePoint === 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
        return '\uFFFD'
    }

    return String.fromCodePoint(codePoint)
}

function isRetryableTinyFishError(
    code: string,
    upstreamStatus?: number,
): boolean {
    if (code === 'target_http_error') {
        return (
            upstreamStatus === 429 ||
            Boolean(upstreamStatus && upstreamStatus >= 500)
        )
    }

    return [
        'timeout',
        'target_unreachable',
        'proxy_error',
        'fetch_error',
    ].includes(code)
}
