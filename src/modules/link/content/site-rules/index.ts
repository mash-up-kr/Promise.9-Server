import { naverBlogRule } from './naver-blog.rule'
import { naverPlaceRule } from './naver-place.rule'
import { SiteRule } from './site-rule.interface'

// 링크 미리보기 특수 처리 화이트리스트. 앞에서부터 첫 매칭 규칙이 적용된다(= 순서가 우선순위).
const SITE_RULES: readonly SiteRule[] = [naverBlogRule, naverPlaceRule]

// URL에 매칭되는 화이트리스트 규칙을 찾는다(없으면 undefined → 기본 처리).
export function resolveSiteRule(url: URL): SiteRule | undefined {
    return SITE_RULES.find((rule) => rule.matches(url))
}
