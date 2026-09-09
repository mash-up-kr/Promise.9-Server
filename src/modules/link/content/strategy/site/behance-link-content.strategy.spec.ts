import { resolveLinkContentStrategy } from '../link-content-strategy.registry'

import { BEHANCE_LINK_CONTENT_STRATEGY as strategy } from './behance-link-content.strategy'

const BEHANCE_PROJECT_URL = new URL(
    'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
)

describe('Behance 프로젝트 전략', () => {
    it.each([
        'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
        'https://behance.net/gallery/32715299/Coves-Free-Font/',
        'https://be.net/gallery/122200727/Google-Feature-Drop',
    ])('공개 프로젝트와 공유 링크를 TinyFish로 수집한다: %s', (raw) => {
        const resolved = resolveLinkContentStrategy(new URL(raw))

        expect(resolved.name).toBe('behance')
        expect(resolved.kind).toBe('tinyfish')
        expect(resolved.source).toBe('behance.net')
    })

    it('공유 호스트와 추적 쿼리를 canonical 프로젝트 URL로 정리한다', () => {
        const resourceUrl = new URL(
            'https://be.net/gallery/122200727/Google-Feature-Drop?tracking_source=search#module',
        )

        expect(strategy.prepareUrl(resourceUrl).toString()).toBe(
            'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
        )
        expect(resourceUrl.toString()).toContain('tracking_source=search')
    })

    it('프로젝트 본문 범위만 TinyFish에 요청한다', () => {
        expect(strategy.fetchOptions!(BEHANCE_PROJECT_URL)).toEqual({
            includeSelectors: ['.project-content-wrap'],
        })
    })

    it('avatar와 추천 프로젝트를 제외하고 첫 프로젝트 모듈 이미지를 선택한다', () => {
        const projectImage =
            'https://mir-s3-cdn-cf.behance.net/project_modules/1400/3712d4122200727.60da38c094d9e.jpg'

        expect(
            strategy.selectImage(BEHANCE_PROJECT_URL, [
                'https://pps.services.adobe.com/api/profile/id/image/50',
                'https://mir-s3-cdn-cf.behance.net/projects/404/recommended.jpg',
                'https://mir-s3-cdn-cf.behance.net/user/276/user.jpg',
                projectImage,
            ]),
        ).toBe(projectImage)
    })

    it('프로젝트 자체 이미지가 없거나 CDN이 유사 도메인이면 null을 반환한다', () => {
        expect(
            strategy.selectImage(BEHANCE_PROJECT_URL, [
                'https://mir-s3-cdn-cf.behance.net/projects/404/cover.jpg',
                'https://mir-s3-cdn-cf.behance.net.evil.test/project_modules/1400/image.jpg',
            ]),
        ).toBeNull()
    })

    it.each([
        'https://www.behance.net/',
        'https://www.behance.net/designer',
        'https://www.behance.net/search/projects',
        'https://www.behance.net/gallery/not-a-number/project',
        'https://www.behance.net/gallery/123/project/extra',
        'https://behance.net.evil.test/gallery/123/project',
    ])('프로젝트가 아닌 URL에는 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })
})
