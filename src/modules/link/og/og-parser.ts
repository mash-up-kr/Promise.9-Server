export interface ParsedOg {
    title: string | null
    image: string | null
}

// HTML에서 미리보기에 쓸 title/image만 정규식으로 뽑는다.
// (의존성 없이 <head>의 메타 태그를 훑는 수준으로 충분)
export function parseOg(html: string): ParsedOg {
    return {
        title:
            findMetaContent(html, 'property', 'og:title') ??
            extractTitleTag(html),
        image:
            findMetaContent(html, 'property', 'og:image') ??
            findMetaContent(html, 'name', 'twitter:image'),
    }
}

// <title>...</title> 값
function extractTitleTag(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (!match) return null

    return decodeEntities(match[1]) || null
}

// 지정한 attr(property/name)과 key가 일치하는 첫 <meta>의 content
function findMetaContent(
    html: string,
    attr: 'property' | 'name',
    key: string,
): string | null {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
        if (attrValue(tag, attr)?.toLowerCase() !== key) continue

        const content = attrValue(tag, 'content')
        const decoded = content ? decodeEntities(content) : ''
        if (decoded) return decoded
    }

    return null
}

// 태그 문자열에서 attr="value" / attr='value' 값을 뽑는다.
function attrValue(tag: string, attr: string): string | null {
    const match = tag.match(
        new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'),
    )
    return match ? (match[2] ?? match[3] ?? null) : null
}

// 미리보기에 필요한 최소한의 HTML 엔티티 디코딩
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/\s+/g, ' ')
        .trim()
}
