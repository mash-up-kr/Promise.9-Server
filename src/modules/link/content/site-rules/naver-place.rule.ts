import { SiteRule } from './site-rule.interface'

// 지도 URL 경로에서 장소 id를 뽑는다. (예: /p/entry/place/1234567, /v5/entry/place/1234567)
const PLACE_ID_PATTERN = /\/place\/(\d+)/

// map.naver.com 장소 링크는 og가 "네이버 지도" 제네릭 값뿐이라 미리보기가 무의미하다.
// 모바일 장소 페이지(m.place.naver.com)는 장소명·사진 og를 제대로 내려주므로 그쪽으로 바꾼다.
// (naver.me 단축 링크도 리다이렉트 최종 URL이 map.naver.com/.../place/{id}라, 미리보기 서비스가
//  최종 URL에 이 규칙을 재적용해 함께 처리된다)
export const naverPlaceRule: SiteRule = {
    name: 'naver-place',

    matches(url) {
        return (
            url.hostname.toLowerCase() === 'map.naver.com' &&
            PLACE_ID_PATTERN.test(url.pathname)
        )
    },

    rewriteUrl(url) {
        const placeId = PLACE_ID_PATTERN.exec(url.pathname)?.[1]
        // matches가 true라 placeId는 항상 존재하지만, 방어적으로 없으면 원본 유지.
        if (!placeId) return url

        return new URL(`https://m.place.naver.com/place/${placeId}/home`)
    },
}
