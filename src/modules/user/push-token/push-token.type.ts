import { Expo } from 'expo-server-sdk'
import { z } from 'zod'

import { PUSH_TOKEN_PLATFORMS } from './push-token.constant'

const expoPushTokenSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
        (token) => Expo.isExpoPushToken(token),
        'Expo Push Token 형식이어야 합니다.',
    )

export const registerPushTokenSchema = z.strictObject({
    token: expoPushTokenSchema,
    platform: z.enum(PUSH_TOKEN_PLATFORMS),
})

export const unregisterPushTokenSchema = z.strictObject({
    token: expoPushTokenSchema,
})

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>
