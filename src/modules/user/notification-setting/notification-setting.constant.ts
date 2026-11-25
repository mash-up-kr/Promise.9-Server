// 설정한 적 없는 채널은 수신으로 본다. 기기 알림 허용이 푸시 수신 동의이며, 허용하지 않은 기기는 토큰이 없어 발송되지 않는다.
export const DEFAULT_NOTIFICATION_SETTINGS = {
    email: true,
    push: true,
} as const
