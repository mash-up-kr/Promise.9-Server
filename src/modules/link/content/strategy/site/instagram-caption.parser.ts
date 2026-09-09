// TinyFish의 captioned embed Markdown에서 작성자 캡션만 추출한다.
// 경계를 식별할 수 없으면 UI 문구를 본문으로 저장하지 않고 null을 반환한다.
export function parseInstagramCaption(text: string | null): string | null {
    if (!text) return null

    const normalized = text.replace(/\r\n?/g, '\n').trim()
    const lines = normalized.split('\n').map((line) => line.trim())
    const author = lines[0]
        .replace(/\\_/g, '_')
        .match(/^([A-Za-z0-9_.]{1,30})(?:\*?Verified\*?)?$/)?.[1]
    if (!author) return null

    const profileIndex = lines.indexOf('View profile')
    if (profileIndex < 1 || profileIndex > 12) return null

    // 음악·재생 버튼·프로필 카드가 끼어드는 형식도 있다. 캡션은
    // 헤더의 좋아요 표시와 그 바로 다음 작성자 이름 뒤에서 시작한다.
    const likesPattern =
        /^(?:[\d,.]+(?:[KM])? likes?|Be the first to like this)$/i
    const likesOffset = lines
        .slice(profileIndex + 1, profileIndex + 33)
        .findIndex((line) => likesPattern.test(line))
    if (likesOffset < 0) return null
    let cursor = profileIndex + 2 + likesOffset
    while (lines[cursor] === '') cursor++
    const captionAuthor = lines[cursor]?.replace(/\\_/g, '_')
    if (captionAuthor !== author && captionAuthor !== `${author}*Verified*`) {
        return null
    }

    const body = lines
        .slice(cursor + 1)
        .join('\n')
        .trim()
    const footer =
        /\n+Add a comment(?:\.\.\.|…)(?:\*Instagram\*|\n*Instagram)\s*$/
    if (!footer.test(body)) return null

    const caption = body
        .replace(footer, '')
        .replace(/(?:^|\n+)View all [\d,.]+ comments?\s*$/, '')
        .replace(/\\([\\`*_[\]{}()#+.!<>~-])/g, '$1')
        .trim()
    return caption || null
}
