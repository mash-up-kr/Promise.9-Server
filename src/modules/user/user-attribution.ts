import { z } from 'zod'

const MAX_MARKETING_TOUCH_CLOCK_SKEW_MS = 5 * 60 * 1_000

const utmValue = z
    .string()
    .trim()
    .max(512)
    .transform((value) => value || null)
    .nullable()
    .default(null)

// 계정과 이벤트는 같은 접점 필드를 사용한다. 로컬·계정 출처는 수집기 내부에서 관리한다.
export const marketingTouchSchema = z
    .strictObject({
        touch_id: z.string().trim().min(1).max(128),
        captured_at: z.iso
            .datetime()
            .transform((value) => new Date(value).toISOString())
            .refine(
                (value) =>
                    Date.parse(value) <=
                    Date.now() + MAX_MARKETING_TOUCH_CLOCK_SKEW_MS,
                {
                    message:
                        '수집 시각은 서버 시각보다 5분을 초과해 앞설 수 없습니다.',
                },
            ),
        utm_source: utmValue,
        utm_medium: utmValue,
        utm_campaign: utmValue,
        utm_content: utmValue,
        utm_term: utmValue,
    })
    .refine(
        (touch) =>
            Boolean(
                touch.utm_source ||
                touch.utm_medium ||
                touch.utm_campaign ||
                touch.utm_content ||
                touch.utm_term,
            ),
        { message: '최소 하나의 UTM 값이 필요합니다.' },
    )

export type MarketingTouch = z.output<typeof marketingTouchSchema>

export interface UserAttribution {
    firstMarketingTouch: MarketingTouch | null
    lastMarketingTouch: MarketingTouch | null
}

export function mergeMarketingTouches(
    stored: UserAttribution,
    incoming: MarketingTouch,
): UserAttribution {
    const firstMarketingTouch = stored.firstMarketingTouch ?? incoming
    const lastMarketingTouch =
        !stored.lastMarketingTouch ||
        Date.parse(incoming.captured_at) >
            Date.parse(stored.lastMarketingTouch.captured_at)
            ? incoming
            : stored.lastMarketingTouch

    if (
        firstMarketingTouch === stored.firstMarketingTouch &&
        lastMarketingTouch === stored.lastMarketingTouch
    ) {
        return stored
    }
    return { firstMarketingTouch, lastMarketingTouch }
}
