import { resolveLinkContentStrategy } from '../link-content-strategy.registry'
import { TinyFishFetchError } from '../../tinyfish/tinyfish-fetch.error'

import { NAVER_PLACE_LINK_CONTENT_STRATEGY as strategy } from './naver-place-link-content.strategy'

describe('네이버 장소 전략', () => {
    it.each([
        'https://m.place.naver.com/share?id=31048068&tabsPath=%2Fhome&appMode=detail',
        'https://map.naver.com/p/entry/place/31048068?placePath=%2Freview',
        'https://map.naver.com/p/search/모모야/place/31048068',
        'https://map.naver.com/v5/entry/place/31048068',
        'https://m.place.naver.com/restaurant/31048068/review/visitor',
        'https://pcmap.place.naver.com/place/31048068/home',
    ])('장소 URL을 모바일 홈으로 정규화한다: %s', (raw) => {
        const url = new URL(raw)
        expect(resolveLinkContentStrategy(url).name).toBe('naver-place')
        expect(strategy.prepareUrl(url).toString()).toBe(
            'https://m.place.naver.com/place/31048068/home',
        )
    })

    it.each([
        'https://map.naver.com/p/directions/-/-/-/transit',
        'https://map.naver.com/p/search/카페',
        'https://m.place.naver.com.evil.test/place/123/home',
        'https://map.naver.com/p/entry/place/123abc',
        'https://naver.me/abc',
        'https://m.place.naver.com/share?id=123abc',
    ])('장소를 특정할 수 없으면 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })

    const photo = (host: string, type = 'w560_sharpen') =>
        `https://search.pstatic.net/common/?type=${type}&src=${encodeURIComponent(`https://${host}/photo.jpg`)}`
    it.each(['ldb.phinf.naver.net', 'ldb-phinf.pstatic.net'])(
        '아이콘·프로필·외부 원본을 제외하고 장소 등록 사진을 우선한다: %s',
        (host) => {
            const official = photo(host)
            expect(
                strategy.selectImage(
                    new URL('https://m.place.naver.com/place/123'),
                    [
                        'https://g-place.pstatic.net/assets/shared/images/icon_default_profile.png',
                        photo('ldb.phinf.naver.net', 'f84_sharpen'),
                        photo('evil.test'),
                        photo('pup-review-phinf.pstatic.net'),
                        official,
                    ],
                ),
            ).toBe(official)
        },
    )
    it('등록 사진이 없으면 리뷰 사진을 사용하고 적절한 사진이 없으면 null을 반환한다', () => {
        const url = new URL('https://m.place.naver.com/place/123')
        expect(
            strategy.selectImage(url, [photo('pup-review-phinf.pstatic.net')]),
        ).toBe(photo('pup-review-phinf.pstatic.net'))
        expect(
            strategy.selectImage(url, [
                photo('pup-review-phinf.pstatic.net', 'f84_sharpen'),
            ]),
        ).toBeNull()
    })
    it('장소명 접미사와 제어 문자를 정리한다', () => {
        const url = new URL('https://m.place.naver.com/place/123')
        const content = {
            title: '모모야 이촌본점 : 네이버\u001c',
            description: null,
            content: '주소',
            imageLinks: [],
        }
        expect(strategy.normalizeContent!(url, content).title).toBe(
            '모모야 이촌본점',
        )
    })

    it.each([
        '네이버 지도',
        '네이버 플레이스',
        '장소 - 네이버지도',
        '로딩중',
        'loading',
    ])('공통·로딩 화면은 재시도 가능한 실패로 반환한다: %s', (title) => {
        expect(() =>
            strategy.normalizeContent!(
                new URL('https://m.place.naver.com/place/123'),
                {
                    title,
                    description: null,
                    content: null,
                    imageLinks: ['logo'],
                },
            ),
        ).toThrow(
            expect.objectContaining({
                name: TinyFishFetchError.name,
                retryable: true,
            }),
        )
    })

    it('제목이 없으면 빈 결과로 정규화한다', () => {
        expect(
            strategy.normalizeContent!(
                new URL('https://m.place.naver.com/place/123'),
                {
                    title: null,
                    description: null,
                    content: '주소',
                    imageLinks: ['logo'],
                },
            ),
        ).toEqual({
            title: null,
            description: null,
            content: null,
            imageLinks: [],
        })
    })
})
