export type DueReminder = {
    linkId: number
    recipientEmail: string
    title: string | null
    originalUrl: string
    finalUrl: string | null
    reminderAt: Date
}

export type ReminderBatchResult = {
    dueCount: number
    sentCount: number
    failedCount: number
}
