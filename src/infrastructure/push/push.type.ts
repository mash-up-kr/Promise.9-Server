import type { ExpoPushErrorReceipt, ExpoPushMessage } from 'expo-server-sdk'

// 한 메시지에 한 토큰만 허용해 입력과 ticket의 대응 관계를 유지한다.
export type PushMessage = Omit<ExpoPushMessage, 'to'> & { to: string }

export type PushProviderError = NonNullable<
    NonNullable<ExpoPushErrorReceipt['details']>['error']
>

export type PushSendResult = { to: string } & (
    | { status: 'accepted'; ticketId: string }
    | { status: 'rejected'; error: PushProviderError | 'InvalidPushToken' }
    // 요청 실패 시 Expo 접수 여부를 확정할 수 없다. 재시도 시 중복될 수 있다.
    | { status: 'unknown'; error: 'REQUEST_FAILED' }
)

export type PushReceiptResult =
    | { status: 'ok' }
    | { status: 'error'; error: PushProviderError }
    | { status: 'pending' }
    | { status: 'unknown'; error: 'REQUEST_FAILED' }
