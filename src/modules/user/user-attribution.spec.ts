import { marketingTouchSchema, mergeMarketingTouches } from './user-attribution'

const first = {
    touch_id: 'touch-first',
    captured_at: '2026-10-14T09:00:00.000Z',
    utm_source: 'instagram',
    utm_medium: 'sns_post',
    utm_campaign: 'friends',
    utm_content: null,
    utm_term: null,
}

describe('marketingTouchSchema', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(
            Date.parse('2026-10-16T00:00:00.000Z'),
        )
    })

    afterEach(() => jest.restoreAllMocks())

    it('허용된 UTM만 저장하고 공백과 생략된 값을 정규화한다', () => {
        expect(
            marketingTouchSchema.parse({
                touch_id: ' touch ',
                captured_at: first.captured_at,
                utm_source: ' instagram ',
                utm_campaign: ' ',
            }),
        ).toEqual({
            ...first,
            touch_id: 'touch',
            utm_medium: null,
            utm_campaign: null,
        })
    })

    it.each([
        {},
        { utm_source: null, utm_medium: ' ' },
        { utm_source: 'a'.repeat(513) },
        { utm_source: 'instagram', user_id: 'other-user' },
        { utm_source: 'instagram', scope: 'user' },
        { utm_source: 'instagram', captured_at: 'invalid' },
        { utm_source: 'instagram', touch_id: '' },
    ])('유효하지 않은 접점은 거부한다: %j', (input) => {
        expect(
            marketingTouchSchema.safeParse({
                touch_id: first.touch_id,
                captured_at: first.captured_at,
                ...input,
            }).success,
        ).toBe(false)
    })

    it.each([
        '2025-10-16T00:00:00.000Z',
        '2026-10-16T00:00:00.000Z',
        '2026-10-16T00:05:00.000Z',
    ])(
        '과거 접점과 서버 시각보다 최대 5분 앞선 접점은 시각을 보존한다: %s',
        (captured_at) => {
            expect(
                marketingTouchSchema.parse({ ...first, captured_at })
                    .captured_at,
            ).toBe(captured_at)
        },
    )

    it.each(['2026-10-16T00:05:00.001Z', '2027-10-16T00:00:00.000Z'])(
        '5분을 초과한 미래 접점은 captured_at 오류로 거부한다: %s',
        (captured_at) => {
            const result = marketingTouchSchema.safeParse({
                ...first,
                captured_at,
            })
            expect(result.success).toBe(false)
            if (!result.success)
                expect(result.error.issues).toEqual([
                    expect.objectContaining({ path: ['captured_at'] }),
                ])
        },
    )

    it('미래 시각 검증은 서버 시작 시각이 아닌 매 요청의 현재 시각을 기준으로 한다', () => {
        const incoming = {
            ...first,
            captured_at: '2026-10-16T00:05:00.001Z',
        }
        expect(marketingTouchSchema.safeParse(incoming).success).toBe(false)
        jest.spyOn(Date, 'now').mockReturnValue(
            Date.parse('2026-10-16T00:00:00.001Z'),
        )
        expect(marketingTouchSchema.parse(incoming).captured_at).toBe(
            incoming.captured_at,
        )
    })
})

describe('mergeMarketingTouches', () => {
    it('첫 유효 접점은 최초·최근 접점 양쪽에 저장한다', () => {
        expect(
            mergeMarketingTouches(
                { firstMarketingTouch: null, lastMarketingTouch: null },
                first,
            ),
        ).toEqual({ firstMarketingTouch: first, lastMarketingTouch: first })
    })

    it('최근 접점 전체를 교체하면서 최초 접점을 보존한다', () => {
        const newer = {
            ...first,
            touch_id: 'touch-new',
            captured_at: '2026-10-15T09:00:00.000Z',
            utm_source: 'newsletter',
            utm_campaign: null,
        }
        expect(
            mergeMarketingTouches(
                { firstMarketingTouch: first, lastMarketingTouch: first },
                newer,
            ),
        ).toEqual({ firstMarketingTouch: first, lastMarketingTouch: newer })
    })

    it.each(['2026-10-13T09:00:00.000Z', first.captured_at])(
        '늦게 도착한 과거 접점·동일 시각의 재전송은 저장된 값을 유지한다: %s',
        (captured_at) => {
            const stored = {
                firstMarketingTouch: first,
                lastMarketingTouch: first,
            }
            expect(
                mergeMarketingTouches(stored, {
                    ...first,
                    touch_id: 'other-device',
                    captured_at,
                    utm_source: 'other',
                }),
            ).toBe(stored)
        },
    )
})
