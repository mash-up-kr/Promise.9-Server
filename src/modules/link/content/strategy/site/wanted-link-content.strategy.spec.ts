import { resolveLinkContentStrategy } from '../link-content-strategy.registry'

import {
    normalizeWantedContent,
    WANTED_LINK_CONTENT_STRATEGY as strategy,
} from './wanted-link-content.strategy'

const POSITION_URL = new URL('https://www.wanted.co.kr/wd/202585')
const COMPANY_IMAGE =
    'https://image.wanted.co.kr/optimize?src=https%3A%2F%2Fstatic.wanted.co.kr%2Fimages%2Fcompany%2F193%2Fyskl5u1uzd45eba5__1080_790.png&w=700&q=100'

const emptyContent = {
    title: null,
    description: null,
    content: null,
    imageLinks: [],
}

describe('원티드 채용 공고 전략', () => {
    it.each([
        'https://www.wanted.co.kr/wd/202585',
        'https://wanted.co.kr/wd/39710',
        'https://www.wanted.co.kr/wd/39710/',
    ])('공개 채용 공고를 TinyFish로 수집한다: %s', (raw) => {
        const resolved = resolveLinkContentStrategy(new URL(raw))

        expect(resolved.name).toBe('wanted')
        expect(resolved.kind).toBe('tinyfish')
        expect(resolved.source).toBe('wanted.co.kr')
    })

    it('추적 쿼리를 제거하고 canonical 공고 URL로 정리한다', () => {
        const resourceUrl = new URL(
            'https://wanted.co.kr/wd/39710?country_code=WW&utm_source=share#apply',
        )

        expect(strategy.prepareUrl(resourceUrl).toString()).toBe(
            'https://www.wanted.co.kr/wd/39710',
        )
        expect(resourceUrl.toString()).toContain('country_code=WW')
    })

    it.each([
        'https://www.wanted.co.kr/',
        'https://www.wanted.co.kr/wdlist',
        'https://www.wanted.co.kr/company/193',
        'https://www.wanted.co.kr/wd/not-a-number',
        'https://www.wanted.co.kr/wd/39710/apply',
        'https://wanted.co.kr.evil.test/wd/39710',
    ])('공고가 아닌 URL에는 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })

    describe('제목·설명·본문 정리', () => {
        it('제목의 원티드 접미사를 제거한다', () => {
            const result = normalizeWantedContent(POSITION_URL, {
                ...emptyContent,
                title: '[위시켓] 백엔드 개발 채용 공고 | 원티드',
            })

            expect(result.title).toBe('[위시켓] 백엔드 개발 채용 공고')
        })

        // 메타 설명은 회사·포지션만 갈아끼운 홍보 문구라 공고 정보가 없다.
        it('정형 홍보 문구인 메타 설명은 사용하지 않는다', () => {
            const result = normalizeWantedContent(POSITION_URL, {
                ...emptyContent,
                description:
                    '위시켓의 백엔드 개발 포지션을 확인해 보세요. 취업·이직에 성공하면, 합격보상금 50만원을 드립니다.',
            })

            expect(result.description).toBeNull()
        })

        it('저작권 고지부터 추천 포지션까지의 사이트 UI를 본문에서 제거한다', () => {
            const result = normalizeWantedContent(POSITION_URL, {
                ...emptyContent,
                content: [
                    '## 포지션 상세',
                    '• 백엔드 API를 개발합니다.',
                    '## 근무지역',
                    '서울특별시 서초구 서초대로 78길 22',
                    '본 채용정보는 원티드랩의 동의없이 무단전재, 재배포, 재가공할 수 없으며',
                    '---',
                    '**<저작권자 (주)원티드랩. 무단전재-재배포금지>**',
                    '## 더 많은 포지션을 찾아 볼까요?',
                    '탐색하기',
                ].join('\n'),
            })

            expect(result.content).toBe(
                [
                    '## 포지션 상세',
                    '• 백엔드 API를 개발합니다.',
                    '## 근무지역',
                    '서울특별시 서초구 서초대로 78길 22',
                ].join('\n'),
            )
        })

        it('저작권 고지가 없는 공고는 본문을 그대로 둔다', () => {
            const body = '## 포지션 상세\n• 3년 이상의 백엔드 개발 경력'
            const result = normalizeWantedContent(POSITION_URL, {
                ...emptyContent,
                content: body,
            })

            expect(result.content).toBe(body)
        })
    })

    describe('대표 이미지 선택', () => {
        it('기본 대체 이미지와 SNS 아이콘을 제외하고 회사 이미지를 고른다', () => {
            expect(
                strategy.selectImage(POSITION_URL, [
                    'https://image.wanted.co.kr/optimize?src=https%3A%2F%2Fstatic.wanted.co.kr%2Fimages%2Fbrand_new%2Finstagram.png&w=20&q=100',
                    'https://image.wanted.co.kr/optimize?src=https%3A%2F%2Fstatic.wanted.co.kr%2Fimages%2Fproposal%2Fcompany-default.png&w=80&q=75',
                    COMPANY_IMAGE,
                ]),
            ).toBe(COMPANY_IMAGE)
        })

        it('원본 호스트를 직접 가리키는 회사 이미지도 허용한다', () => {
            const direct =
                'https://static.wanted.co.kr/images/company/193/yskl5u1uzd45eba5__1080_790.png'

            expect(strategy.selectImage(POSITION_URL, [direct])).toBe(direct)
        })

        it.each([
            // 유사 도메인
            'https://image.wanted.co.kr.evil.test/optimize?src=https%3A%2F%2Fstatic.wanted.co.kr%2Fimages%2Fcompany%2F193%2Fa.png',
            // src가 외부 호스트
            'https://image.wanted.co.kr/optimize?src=https%3A%2F%2Fevil.test%2Fimages%2Fcompany%2F193%2Fa.png',
            // 회사 이미지 경로가 아님
            'https://image.wanted.co.kr/optimize?src=https%3A%2F%2Fstatic.wanted.co.kr%2Fimages%2Fproposal%2Fcompany-default.png',
        ])('공고 이미지가 아니면 선택하지 않는다: %s', (image) => {
            expect(strategy.selectImage(POSITION_URL, [image])).toBeNull()
        })

        it('회사 이미지가 없으면 null을 반환한다', () => {
            expect(strategy.selectImage(POSITION_URL, [])).toBeNull()
        })
    })
})
