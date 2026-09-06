export type ReminderEmailTarget = {
    linkId: number
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
    failedCount: number
}
