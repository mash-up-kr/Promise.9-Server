import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { TinyFishFetchError } from '../../tinyfish/tinyfish-fetch.error'

export function extractNaverPlaceId(url: URL): string | null {
    if (
        [
            'm.place.naver.com',
            'pcmap.place.naver.com',
            'place.naver.com',
        ].includes(url.hostname)
    ) {
        if (url.pathname === '/share') {
            const id = url.searchParams.get('id')
            return id && /^\d+$/.test(id) ? id : null
        }
        return (
            url.pathname.match(
                /^\/(?:place|restaurant|cafe|accommodation|hospital|beauty)\/(\d+)(?:\/|$)/,
            )?.[1] ?? null
        )
    }
    if (url.hostname === 'map.naver.com') {
        return (
            url.pathname.match(
                /^\/(?:p|v5)\/(?:entry\/place|search\/[^/]+\/place)\/(\d+)(?:\/|$)/,
            )?.[1] ?? null
        )
    }
    return null
}

export const NAVER_PLACE_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'naver-place',
    source: 'map.naver.com',
    supports: (url) => extractNaverPlaceId(url) !== null,
    prepareUrl: (url) =>
        new URL(
            `https://m.place.naver.com/place/${extractNaverPlaceId(url)}/home`,
        ),
    normalizeContent: (_url, content) => {
        const title =
            content.title
                ?.replace(/\p{Cc}/gu, '')
                .replace(/\s*:\s*네이버\s*$/, '')
                .trim() || null
        if (
            title &&
            /^(?:네이버\s*(?:지도|플레이스)|장소\s*-\s*네이버지도|로딩중|loading)$/i.test(
                title,
            )
        ) {
            throw new TinyFishFetchError({
                message:
                    'TinyFish가 네이버 장소 페이지 렌더링을 완료하지 못했습니다.',
                retryable: true,
            })
        }
        if (!title) {
            return {
                title: null,
                description: null,
                content: null,
                imageLinks: [],
            }
        }
        return { ...content, title }
    },
    selectImage: (_url, images) => {
        // 관측된 콘텐츠 사진만 사용한다. 프로필(f84), 로고·배너는 제외한다.
        const candidates = images.flatMap((image) => {
            try {
                const url = new URL(image)
                if (
                    url.protocol !== 'https:' ||
                    url.hostname !== 'search.pstatic.net' ||
                    url.pathname !== '/common/'
                )
                    return []
                if (url.searchParams.get('type') !== 'w560_sharpen') return []
                const source = new URL(url.searchParams.get('src') ?? '')
                if (!['http:', 'https:'].includes(source.protocol)) return []
                const hosts = [
                    'ldb.phinf.naver.net',
                    'ldb-phinf.pstatic.net',
                    'pup-review-phinf.pstatic.net',
                    'blogfiles.pstatic.net',
                    'blogfiles.naver.net',
                    'clip-service-phinf.pstatic.net',
                ]
                if (!hosts.includes(source.hostname)) return []
                return [
                    {
                        image,
                        official: [
                            'ldb.phinf.naver.net',
                            'ldb-phinf.pstatic.net',
                        ].includes(source.hostname),
                    },
                ]
            } catch {
                return []
            }
        })
        // 장소 등록 사진 후보를 우선하고, 없으면 장소 페이지의 리뷰 사진을 사용한다.
        return (
            (
                candidates.find((candidate) => candidate.official) ??
                candidates[0]
            )?.image ?? null
        )
    },
}
