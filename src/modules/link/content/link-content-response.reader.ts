import { LINK_CONTENT_FETCH } from './link-content.constants'

// 응답을 제한 크기까지만 읽고 Content-Type의 charset에 맞춰 문자열로 변환한다.
export async function readLinkContentText(response: Response): Promise<string> {
    if (!response.body) return ''

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedBytes = 0

    try {
        while (true) {
            const { done, value } = await reader.read()

            if (done) break
            if (!value) continue

            receivedBytes += value.byteLength
            chunks.push(value)

            if (receivedBytes >= LINK_CONTENT_FETCH.maxBytes) {
                await reader.cancel()
                break
            }
        }
    } finally {
        reader.releaseLock()
    }

    return decodeBody(
        Buffer.concat(chunks),
        response.headers.get('content-type'),
    )
}

export function cancelLinkContentResponse(response: Response): void {
    void response.body?.cancel().catch(() => undefined)
}

function decodeBody(buffer: Buffer, contentType: string | null): string {
    const charset = contentType
        ? /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase()
        : undefined

    try {
        return new TextDecoder(charset || 'utf-8').decode(buffer)
    } catch {
        return buffer.toString('utf8')
    }
}
