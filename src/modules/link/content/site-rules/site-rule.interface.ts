import { LinkPreview } from '../link-content.type'

// 특정 도메인에 대한 링크 미리보기 처리 규칙(화이트리스트 단위).
// 훅은 전부 optional이라 규칙은 자기가 필요한 것만 구현한다.
//   - rewriteUrl:      fetch 전 URL을 바꿔 기존 파이프라인을 그대로 재사용 (예: PC→모바일)
//   - transformPreview: 파싱된 결과를 정리/무효화 (예: 제네릭 og 버리기)
//   - fetchPreview:    파이프라인을 통째로 대체 (예: 별도 API 호출)
export interface SiteRule {
    // 로깅·식별용 이름 (예: 'naver-blog')
    readonly name: string

    // 이 규칙이 처리할 URL인지 판별한다.
    matches(url: URL): boolean

    // fetch 전 URL 변형. 반환한 URL로 실제 요청을 보낸다.
    rewriteUrl?(url: URL): URL

    // 파싱 후 결과 후처리. finalUrl은 리다이렉트까지 따라간 최종 URL.
    transformPreview?(preview: LinkPreview, finalUrl: URL): LinkPreview

    // 기본 파이프라인(fetch+parse) 대신 규칙이 직접 미리보기를 만든다.
    fetchPreview?(url: URL): Promise<LinkPreview>
}
