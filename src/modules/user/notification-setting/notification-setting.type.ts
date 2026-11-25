import { z } from 'zod'

export interface NotificationSettings {
    email: boolean
    push: boolean
}

export const updateNotificationSettingsSchema = z
    .strictObject({
        email: z.boolean().optional(),
        push: z.boolean().optional(),
    })
    .refine(
        (input) => input.email !== undefined || input.push !== undefined,
        '변경할 채널을 하나 이상 지정해야 합니다.',
    )

export type UpdateNotificationSettingsInput = z.infer<
    typeof updateNotificationSettingsSchema
>
