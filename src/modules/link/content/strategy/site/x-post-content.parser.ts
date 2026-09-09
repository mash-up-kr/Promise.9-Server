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
    const authorName = lines
        .slice(0, authorIndex)
        .findLast((line) => line.trim())
        ?.trim()
    // TinyFish가 동일 article을 반복할 수 있으므로 첫 작성자 블록 안에서 찾는다.
    const repeatIndex = lines.findIndex(
        (line, index) =>
            index > authorIndex &&
            line.trim() === authorName &&
            lines
                .slice(index + 1)
                .find((next) => next.trim())
                ?.trim() === lines[authorIndex]?.trim(),
    )
    const blockEnd = repeatIndex < 0 ? lines.length : repeatIndex
    const footerIndex = lines.findLastIndex(
        (line, index) =>
            index > authorIndex &&
            index < blockEnd &&
            /^(?:(?:\d{1,2}:\d{2}\s*(?:AM|PM)?)|(?:(?:오전|오후)\s*\d{1,2}:\d{2}))\s*·\s*.+(?:\d{4}|\d{4}년)/i.test(
                line.trim(),
            ) &&
            // 후보 뒤에 일반 문장이나 다른 형식의 시각이 있으면 본문 일정일 수 있다.
            lines
                .slice(index + 1, blockEnd)
                .every((tail) =>
                    /^(?:[\d\s.,·KMB만천억]*\s*(?:Views|조회수)?)?$/i.test(
                        tail.trim(),
                    ),
                ),
    )
    // 본문 형식이 바뀌어도 수집한 이미지를 버리지 않는다.
    // 경계를 찾지 못하면 페이지 UI 대신 메타 설명을 사용한다.
    let body =
        authorIndex >= 0 && footerIndex > authorIndex
            ? lines
                  .slice(authorIndex + 1, footerIndex)
                  .join('\n')
                  .trim()
            : (content.description?.trim() ?? '')
    // 영상 표본에서 TinyFish가 poster Markdown 뒤에 플레이어 시간을 붙인다.
    // 실제 imageLinks의 이미지 바로 뒤에 있는 시간만 지워 작성한 시각은 보존한다.
    const imageLinks = new Set(content.imageLinks)
    body = body
        .replace(
            /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)(?:\s*\n\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*\/\s*\d{1,2}:\d{2}(?::\d{2})?)?(?=\s*$))?/g,
            (match, url: string) => (imageLinks.has(url) ? '' : match),
        )
        .trim()
    // 메타 설명이 본문과 대응하면 전문을 보존한다. 대응하지 않으면 설명으로 대체한다.
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
        if (prefix && start < 0) body = description
        else if (start > 0) body = body.slice(start)
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
