import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { ReminderService } from './reminder.service'

@Injectable()
export class ReminderScheduler {
    private readonly logger = new Logger(ReminderScheduler.name)

    constructor(private readonly reminderService: ReminderService) {}

    @Cron('0 */15 * * * *', {
        name: 'link-reminder',
        waitForCompletion: true,
    })
    async sendReminders() {
        try {
            const { targetCount, finishedCount, skippedCount, email, push } =
                await this.reminderService.sendReminders()

            if (targetCount > 0 || finishedCount > 0) {
                this.logger.log(
                    `리마인드 배치를 완료했습니다. target=${targetCount} finished=${finishedCount} skipped=${skippedCount} email.sent=${email.sent} email.failed=${email.failed} push.sent=${push.sent} push.failed=${push.failed}`,
                )
            }
        } catch (error) {
            this.logError('리마인드 배치', error)
        }

        try {
            await this.reminderService.checkPushReceipts()
        } catch (error) {
            this.logError('리마인드 푸시 receipt 조회', error)
        }
    }

    private logError(action: string, error: unknown) {
        const message = error instanceof Error ? error.message : String(error)

        this.logger.error(
            `${action}에 실패했습니다. error=${message}`,
            error instanceof Error ? error.stack : undefined,
        )
    }
}
