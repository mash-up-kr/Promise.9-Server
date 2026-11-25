export type ReminderHistory = {
    id: number
    status: 'PENDING' | 'ACCEPTED' | 'RECEIPT_OK' | 'FAILED' | 'UNKNOWN'
    errorCode: string | null
    createdAt: Date
}

export type ReminderTarget = {
    linkId: number
    userId: number
    occurrenceId: string
    // 일정을 마쳤으면 null이다. 이때는 실패한 채널의 재시도만 남는다.
    reminderAt: Date | null
    recipientEmail: string
    title: string | null
    originalUrl: string
    finalUrl: string | null
    createdAt: Date
    memo: string | null
    folderName: string | null
    folderColor: string | null
    // 발송 시점의 수신 설정. 설정한 적 없으면 true
    emailEnabled: boolean
    pushEnabled: boolean
    emailHistory: ReminderHistory | null
    pushTokens: { id: number; token: string }[]
    pushHistories: (ReminderHistory & { pushTokenId: number | null })[]
}

export type PushHistoryResult = {
    status: 'ACCEPTED' | 'RECEIPT_OK' | 'FAILED' | 'UNKNOWN'
    ticketId?: string
    errorCode?: string
}

export type PushReceiptTarget = {
    id: number
    userId: number
    pushTokenId: number | null
    ticketId: string
}

export type ReminderEmailData = {
    recipientEmail: string
    title: string | null
    url: string
    linkId: number
    reminderAt: Date
    createdAt: Date
    memo: string | null
    folderName: string | null
    folderColor: string | null
}

export type ReminderChannelResult = {
    sent: number
    failed: number
}

export type ReminderBatchResult = {
    targetCount: number
    // 보냈거나, 보낼 채널이 없거나, 재시도 기한이 지나 마친 일정 수
    finishedCount: number
    email: ReminderChannelResult
    push: ReminderChannelResult
}
