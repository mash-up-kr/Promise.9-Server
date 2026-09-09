import { TinyFishFetchError } from '../../tinyfish/tinyfish-fetch.error'
import { TinyFishResponseContent } from '../../tinyfish/tinyfish-response.parser'

// 대상 article 내부에서도 작성자·시각·반응 수를 본문에 포함하지 않는다.
export function normalizeXPostContent(
    content: TinyFishResponseContent,
): TinyFishResponseContent {
    const text =
        content.content
            ?.replace(/\r\n?/g, '\n')
            .replace(/\\([\\`*_[\]{}()#+.!<>~-])/g, '$1')
            .trim() ?? ''
    const lines = text.split('\n')
    const authorIndex = lines.findIndex((line) =>
        /^@[A-Za-z0-9_]{1,15}$/.test(line.trim()),
    )
    const footerIndex = lines.findIndex(
        (line, index) =>
            index > authorIndex &&
            /^(?:(?:\d{1,2}:\d{2}\s*(?:AM|PM)?)|(?:(?:오전|오후)\s*\d{1,2}:\d{2}))\s*·\s*.+(?:\d{4}|\d{4}년)/i.test(
                line.trim(),
            ),
    )
    if (authorIndex < 0 || footerIndex < 0) {
        throw new TinyFishFetchError({
            message: 'X 게시물 본문 경계를 확인하지 못했습니다.',
            retryable: true,
        })
    }
    let body = lines
        .slice(authorIndex + 1, footerIndex)
        .join('\n')
        .trim()
    // 영상 표본에서 TinyFish가 poster Markdown 뒤에 플레이어 시간을 붙인다.
    // 실제 imageLinks의 이미지 바로 뒤에 있는 시간만 지워 작성한 시각은 보존한다.
    const imageLinks = new Set(content.imageLinks)
    body = body
        .replace(
            /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)(?:\s*\n\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*\/\s*\d{1,2}:\d{2}(?::\d{2})?)?(?=\s*$))?/g,
            (match, url: string) => (imageLinks.has(url) ? '' : match),
        )
        .trim()
    // 메타 설명은 본문 일부일 수 있다. 시작점을 확인할 때만 사용하고 전문을 대체하지 않는다.
    const description = content.description?.trim()
    if (description) {
        const prefix = description
            .replace(/(?:…|\.\.\.)$/, '')
            .split(/https?:\/\//)[0]
            .trim()
            .slice(0, 80)
        const pattern = prefix
            .split(/\s+/)
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+')
        const start = prefix ? body.search(new RegExp(pattern)) : 0
        if (prefix && start < 0) {
            throw new TinyFishFetchError({
                message: 'X 게시물 설명과 수집 본문이 일치하지 않습니다.',
                retryable: true,
            })
        }
        if (start > 0) body = body.slice(start)
    }
    const title =
        Array.from(
            body
                .split('\n')
                .find((line) => line.trim())
                ?.trim() ?? '',
        )
            .slice(0, 100)
            .join('') || null
    return {
        ...content,
        title,
        description: body || null,
        content: body || null,
    }
}
