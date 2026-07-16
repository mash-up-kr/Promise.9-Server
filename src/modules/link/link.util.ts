import { LinkMetadata } from './link.schema'

// 사용자별 중복 저장 판단 키로 쓸 URL 정규화. 처음에는 단순하게:
// - 프로토콜/호스트 소문자, fragment(#) 제거, 끝의 '/' 제거
// - 파싱 실패 시 원본을 그대로 반환
// (redirect 추적 기반 정규화는 메타데이터 수집 도입 시 확장)
export function normalizeUrl(raw: string): string {
    try {
        const url = new URL(raw)
        url.hash = ''
        url.protocol = url.protocol.toLowerCase()
        url.hostname = url.hostname.toLowerCase()

        let normalized = url.toString()
        if (url.pathname !== '/' && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1)
        }

        return normalized
    } catch {
        return raw
    }
}

// 출처 표시·검색용 도메인 추출. 파싱 실패 시 null.
export function extractDomain(raw: string): string | null {
    try {
        return new URL(raw).hostname
    } catch {
        return null
    }
}

// metadata의 첫 이미지 URL을 썸네일로 사용. 없으면 null.
export function pickThumbnailUrl(metadata: LinkMetadata | null): string | null {
    return metadata?.images?.[0]?.url ?? null
}
