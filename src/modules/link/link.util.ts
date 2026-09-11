import { CollectedLinkImage } from './content/link-content.type'
import { extractImageExpiry } from './content/link-content-image-expiry.util'
import {
    extractYoutubeVideoId,
    YOUTUBE_LINK_CONTENT_STRATEGY,
} from './content/strategy/site/youtube-link-content.strategy'
import { LinkMetadata, LinkRow } from './link.schema'

// 문서를 식별하지 않고 유입 경로만 남기는 쿼리 파라미터. 중복 판단 키에서 제거한다.
const TRACKING_QUERY_PARAMS = new Set([
    'fbclid',
    'gclid',
    'dclid',
    'gbraid',
    'wbraid',
    'msclkid',
    'twclid',
    'ttclid',
    'yclid',
    'mc_cid',
    'mc_eid',
    'igsh',
    'igshid',
    'igsi',
    'img_index',
    'si',
    'feature',
    'ref_src',
    'ref_url',
    'share_id',
    '_ga',
    '_gl',
])
const TRACKING_QUERY_PARAM_PREFIXES = ['utm_', 'mtm_', 'pk_', 'hsa_']

// 사용자별 중복 저장 판단 키로 쓸 URL 정규화.
// - 프로토콜/호스트 소문자, fragment(#) 제거, 경로 끝의 '/' 제거
// - 추적용 쿼리 파라미터 제거, 남은 파라미터는 이름순 정렬
// - 파싱 실패 시 원본을 그대로 반환
export function normalizeUrl(raw: string): string {
    try {
        const url = new URL(raw)
        url.hash = ''
        url.protocol = url.protocol.toLowerCase()
        url.hostname = url.hostname.toLowerCase()

        // 쿼리가 있어도 경로 끝 '/'는 같은 문서를 가리키므로 경로 기준으로 제거한다.
        if (url.pathname !== '/' && url.pathname.endsWith('/')) {
            url.pathname = url.pathname.replace(/\/+$/, '')
        }

        url.search = normalizeSearchParams(url.searchParams)

        return url.toString()
    } catch {
        return raw
    }
}

// 추적 파라미터를 걷어내고 나머지를 이름순으로 정렬해 순서만 다른 URL을 같은 키로 만든다.
function normalizeSearchParams(params: URLSearchParams): string {
    const kept = [...params.entries()].filter(
        ([name]) => !isTrackingQueryParam(name),
    )
    kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    return new URLSearchParams(kept).toString()
}

function isTrackingQueryParam(name: string): boolean {
    const lowered = name.toLowerCase()

    return (
        TRACKING_QUERY_PARAMS.has(lowered) ||
        TRACKING_QUERY_PARAM_PREFIXES.some((prefix) =>
            lowered.startsWith(prefix),
        )
    )
}

export function extractDomain(raw: string): string | null {
    try {
        return new URL(raw).hostname
    } catch {
        return null
    }
}

// metadata의 첫 이미지 URL을 썸네일로 사용. 없으면 null.
// 개발자 검토 상태는 내부 운영용이므로 클라이언트에는 SUCCESS로 내려준다.
export function toProcessingStatus(
    aiSummaryStatus: string,
): 'PENDING' | 'SUCCESS' | 'FAILED' {
    if (aiSummaryStatus === 'NEEDS_REVIEW') return 'SUCCESS'

    return aiSummaryStatus as 'PENDING' | 'SUCCESS' | 'FAILED'
}

export function pickThumbnailUrl(metadata: LinkMetadata | null): string | null {
    return metadata?.images?.[0]?.url ?? null
}

// metadata.images에 보관할 최대 개수. Instagram CDN URL은 갱신할 때마다 서명이 바뀌어
// 매번 새 항목이 되므로, 상한이 없으면 만료된 URL이 무한히 쌓인다.
const MAX_STORED_IMAGES = 5

// 대표 이미지(images[0])를 새 이미지로 교체하고 TTL을 다시 계산한다.
// 링크 분석과 썸네일 갱신 스케줄러가 같은 병합 규칙을 쓰도록 공유한다.
export function mergeImageMetadata(
    metadata: LinkMetadata | null,
    image: CollectedLinkImage,
    dominantColor?: string,
): LinkMetadata {
    const existingImages = metadata?.images ?? []
    const existingImage = existingImages.find(
        (candidate) => candidate.url === image.url,
    )
    const expiresAt = extractImageExpiry(image.url)
    const mergedImage = {
        ...existingImage,
        url: image.url,
        source: image.source,
        ...(dominantColor ? { dominantColor } : {}),
        ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
    }

    return {
        ...metadata,
        version: metadata?.version ?? 1,
        images: [
            mergedImage,
            ...existingImages.filter(
                (candidate) => candidate.url !== image.url,
            ),
        ].slice(0, MAX_STORED_IMAGES),
    }
}

// 대표 이미지의 TTL 만료 시각. 없으면 null.
// expiresAt이 없으면 URL에서 직접 파싱한다. 이 필드가 생기기 전에 저장된 행에는
// 값이 없고 URL의 oe 파라미터만 있으므로, 폴백이 없으면 그 링크들이 갱신 대상에서 빠진다.
export function pickThumbnailExpiresAt(
    metadata: LinkMetadata | null,
): Date | null {
    const image = metadata?.images?.[0]

    if (!image) return null

    return image.expiresAt
        ? new Date(image.expiresAt)
        : extractImageExpiry(image.url)
}

// YouTube Data API 이용정책상 수집한 데이터는 최소 30일마다 다시 가져와야 한다.
const YOUTUBE_CONTENT_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

// CONTENT를 다시 수집해야 하는 가장 이른 시각. 썸네일 TTL 만료와 YouTube 30일 정책 중
// 해당하는 사유가 여럿이면 더 이른 시각을 쓴다. 해당 사유가 없으면 null —
// links.contentRefreshDueAt에 그대로 반영해 스케줄러가 이 컬럼만으로 대상을 조회한다.
export function pickContentRefreshDueAt(
    url: string,
    metadata: LinkMetadata | null,
    now: Date = new Date(),
): Date | null {
    const imageExpiresAt = pickThumbnailExpiresAt(metadata)
    const policyDueAt = hasYoutubeVideoId(url)
        ? new Date(now.getTime() + YOUTUBE_CONTENT_REFRESH_INTERVAL_MS)
        : null

    if (!imageExpiresAt && !policyDueAt) return null

    const dueAt = new Date(
        Math.min(
            imageExpiresAt?.getTime() ?? Infinity,
            policyDueAt?.getTime() ?? Infinity,
        ),
    )

    // 이미 지난 기한을 그대로 저장하면 스케줄러가 매 실행마다 같은 링크를 다시 집어
    // 정상 링크의 순번을 밀어낸다. 방금 재수집했는데도 만료된 이미지뿐이라면
    // (새 이미지를 못 얻었거나 제목만 수집된 경우) 쿨다운 뒤에 다시 시도한다.
    return dueAt > now
        ? dueAt
        : new Date(now.getTime() + CONTENT_REFRESH_COOLDOWN_MS)
}

// 영상 ID를 뽑을 수 있는 URL만 30일 정책 대상이다. 채널·재생목록·검색 결과처럼 ID가 없는
// URL은 Data API를 타지 않아 저장된 정책 대상 데이터도 없다. 수집 경로가 Data API 호출 여부를
// 정할 때 쓰는 getVideoId를 같이 사용해, 두 판정이 어긋나지 않게 한다.
function hasYoutubeVideoId(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl)

        return (
            YOUTUBE_LINK_CONTENT_STRATEGY.supports(url) &&
            Boolean(extractYoutubeVideoId(url))
        )
    } catch {
        return false
    }
}

// 재수집을 예약할 때 다음 기한을 이만큼 미뤄둔다. 수집이 실패해도 같은 링크가 매 스케줄러
// 실행·매 상세 조회마다 다시 잡히지 않게 하는 쿨다운이며, 성공하면 분석이 실제 만료 시각으로
// 덮어쓴다. 스케줄러 조회 창(CONTENT_REFRESH_LEAD_TIME_MS)보다 길어야 다음 실행에서 빠진다.
export const CONTENT_REFRESH_COOLDOWN_MS = 48 * 60 * 60 * 1000

// 임베딩 대상 텍스트를 조립한다. 의미가 담긴 필드를 우선 결합하며, 빈 값은 제외한다.
export function buildEmbeddingText(
    link: Pick<LinkRow, 'title' | 'aiSummary'> & {
        tagNames: readonly string[]
    },
): string {
    return [link.title, ...link.tagNames, link.aiSummary]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join('\n')
}
