import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { TinyFishResponseContent } from '../../tinyfish/tinyfish-response.parser'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'

const WANTED_HOSTNAMES = new Set(['wanted.co.kr', 'www.wanted.co.kr'])
const WANTED_POSITION_PATH = /^\/wd\/(\d+)\/?$/

// 문서 제목은 항상 "[회사] 포지션 채용 공고 | 원티드" 형태다. 사이트명 접미사만 뗀다.
const WANTED_TITLE_SUFFIX = /\s*\|\s*원티드\s*$/

// 본문 끝에 붙는 원티드랩 저작권 고지와 추천 포지션 블록. 공고 내용이 아니라 사이트 UI다.
const WANTED_FOOTER_LINE =
    /^\s*(?:본 채용정보는 원티드랩의|\*{0,2}<저작권자|#{1,3}\s*더 많은 포지션을)/

export const WANTED_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'wanted',
    source: 'wanted.co.kr',
    supports: (url) =>
        WANTED_HOSTNAMES.has(url.hostname.toLowerCase()) &&
        WANTED_POSITION_PATH.test(url.pathname),
    // 같은 공고라도 country_code 등 추적 쿼리가 붙는다. 같은 응답을 주는 것을 확인해 정리한다.
    prepareUrl: (url) =>
        new URL(`/wd/${getWantedPositionId(url)}`, 'https://www.wanted.co.kr'),
    normalizeContent: normalizeWantedContent,
    selectImage: (_resourceUrl, imageLinks) =>
        findFirstTinyFishImage(imageLinks, isWantedCompanyImage),
}

export function normalizeWantedContent(
    _resourceUrl: URL,
    content: TinyFishResponseContent,
): TinyFishResponseContent {
    return {
        ...content,
        title: content.title?.replace(WANTED_TITLE_SUFFIX, '').trim() || null,
        // 메타 설명은 "{회사}의 {포지션} 포지션을 확인해 보세요. 합격보상금 …" 정형 홍보 문구라
        // 공고 정보가 없다. 저장·AI 입력을 오염시키지 않도록 본문(content)만 사용한다.
        description: null,
        content: trimWantedFooter(content.content),
    }
}

// 저작권 고지부터 끝까지 잘라낸다. 고지가 없는 공고도 있으므로 못 찾으면 본문을 그대로 둔다.
function trimWantedFooter(rawContent: string | null): string | null {
    if (!rawContent) return null

    const lines = rawContent.split('\n')
    const footerIndex = lines.findIndex((line) => WANTED_FOOTER_LINE.test(line))
    const body = (footerIndex < 0 ? lines : lines.slice(0, footerIndex))
        .join('\n')
        .trim()

    return body || null
}

// 회사가 올린 공고 이미지만 고른다. 기본 대체 이미지(images/proposal)와
// SNS·스토어 아이콘(images/brand_new)은 공고의 이미지가 아니다.
function isWantedCompanyImage(url: URL): boolean {
    if (url.protocol !== 'https:') return false

    const assetPath = resolveWantedAssetPath(url)

    return assetPath !== null && /^\/images\/company\/\d+\//.test(assetPath)
}

// 이미지는 image.wanted.co.kr/optimize?src=<static 원본> 형태로 내려온다.
// 원본 호스트를 직접 가리키는 경우도 같은 자산이라 함께 허용한다.
function resolveWantedAssetPath(url: URL): string | null {
    if (url.hostname === 'static.wanted.co.kr') return url.pathname

    if (url.hostname !== 'image.wanted.co.kr') return null

    const source = url.searchParams.get('src')
    if (!source) return null

    try {
        const origin = new URL(source)
        return origin.hostname === 'static.wanted.co.kr'
            ? origin.pathname
            : null
    } catch {
        return null
    }
}

function getWantedPositionId(url: URL): string {
    return WANTED_POSITION_PATH.exec(url.pathname)?.[1] ?? ''
}
