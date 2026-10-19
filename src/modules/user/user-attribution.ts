import { z } from 'zod'

const MAX_MARKETING_TOUCH_CLOCK_SKEW_MS = 5 * 60 * 1_000

const utmValue = z
    .string()
    .trim()
    .max(512)
    .transform((value) => value || null)
    .nullable()
    .default(null)

// 계정 동기화용 접점은 touch_id·captured_at을 포함한다. 이벤트에는 UTM 다섯 필드만 담는다.
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
