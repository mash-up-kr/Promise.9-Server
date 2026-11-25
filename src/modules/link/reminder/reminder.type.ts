export type ReminderEmailTarget = {
    linkId: number
    userId: number
    recipientEmail: string
    title: string | null
    originalUrl: string
    finalUrl: string | null
    reminderAt: Date
    createdAt: Date
    memo: string | null
    folderName: string | null
    folderColor: string | null
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

export type ReminderBatchResult = {
    targetCount: number
    sentCount: number
    // 받을 채널이 없어 보내지 않고 일정을 마친 건수
    skippedCount: number
    failedCount: number
}
