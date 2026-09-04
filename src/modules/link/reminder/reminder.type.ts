export type ReminderEmailTarget = {
    linkId: number
    recipientEmail: string
    title: string | null
    originalUrl: string
    finalUrl: string | null
    reminderAt: Date
}

export type ReminderEmailData = {
    recipientEmail: string
    title: string | null
    url?: string
}

export type ReminderBatchResult = {
    dueCount: number
    sentCount: number
    failedCount: number
}
