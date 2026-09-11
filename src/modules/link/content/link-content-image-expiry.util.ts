import { isInstagramImageUrl } from './strategy/site/instagram-link-content.strategy'

// Instagram/Facebook CDN 서명 URL은 oe 파라미터(16진수 UNIX 초)로 만료 시각을 담는다.
// TTL이 없거나 알려진 형식이 아니면 null.
export function extractImageExpiry(imageUrl: string): Date | null {
    let url: URL

    try {
        url = new URL(imageUrl)
    } catch {
        return null
    }

    if (!isInstagramImageUrl(url)) return null

    const oe = url.searchParams.get('oe')
    if (!oe || !/^[0-9a-fA-F]+$/.test(oe)) return null

    const epochSeconds = parseInt(oe, 16)
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return null

    return new Date(epochSeconds * 1000)
}
