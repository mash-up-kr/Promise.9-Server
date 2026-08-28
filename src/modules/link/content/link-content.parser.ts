import { ParsedLinkInformation, ParsedLinkPreview } from './link-content.type'

const HTML_MARKUP_PATTERN =
    /<(script|style|noscript)(?=[\t\n\f\r />])(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1(?=[\t\n\f\r />])(?:[^>"']|"[^"]*"|'[^']*')*>|$)|<!--[\s\S]*?(?:-->|$)|<(?:[^>"']|"[^"]*"|'[^']*')+>/gi

// 요약과 태그 생성에 필요한 제목, 설명, 읽을 수 있는 본문을 HTML에서 추출한다.
export function parseLinkInformation(html: string): ParsedLinkInformation {
    const content = extractReadableContent(html)

    return {
        title:
            findMetaContent(html, 'property', 'og:title') ?? extractTitle(html),
        description:
            findMetaContent(html, 'name', 'description') ??
            findMetaContent(html, 'property', 'og:description'),
        content: content || null,
    }
}

// 링크 저장 전 미리보기에 필요한 제목과 대표 이미지 경로를 HTML에서 추출한다.
export function parseLinkPreview(html: string): ParsedLinkPreview {
    const openGraphImage = findMetaContent(html, 'property', 'og:image')
    const twitterImage = openGraphImage
        ? null
        : findMetaContent(html, 'name', 'twitter:image')

    return {
        title:
            findMetaContent(html, 'property', 'og:title') ?? extractTitle(html),
        image: openGraphImage ?? twitterImage,
        imageSource: openGraphImage
            ? 'og:image'
            : twitterImage
              ? 'twitter:image'
              : null,
    }
}

// 지정한 name/property를 가진 첫 meta 태그의 content를 HTML decode하여 반환한다.
function findMetaContent(
    html: string,
    attribute: 'name' | 'property',
    key: string,
): string | null {
    const tags = html.match(/<meta\b[^>]*>/gi) ?? []

    for (const tag of tags) {
        const attributeValue = readAttribute(tag, attribute)

        if (attributeValue?.toLowerCase() !== key) continue

        const content = readAttribute(tag, 'content')
        const decoded = content ? decodeHtml(content) : ''

        if (decoded) return decoded
    }

    return null
}

// og:title이 없는 페이지에서 title 태그의 텍스트를 제목으로 사용한다.
function extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)

    if (!match) return null

    return decodeHtml(match[1]) || null
}

// HTML 주석, script/style/noscript 내용과 나머지 태그를 제거해 AI 입력용 본문을 만든다.
function extractReadableContent(html: string): string {
    return decodeHtml(
        html.replace(HTML_MARKUP_PATTERN, ' ').replace(/\s+/g, ' ').trim(),
    )
}

// 단일 HTML 태그에서 따옴표로 감싼 속성값을 읽는다.
function readAttribute(tag: string, attribute: string): string | null {
    const match = tag.match(
        new RegExp(`\\b${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'),
    )

    return match?.[2] ?? match?.[3] ?? null
}

// 수집 텍스트에 자주 포함되는 기본 HTML entity를 사람이 읽을 수 있는 문자로 바꾼다.
function decodeHtml(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/\s+/g, ' ')
        .trim()
}
