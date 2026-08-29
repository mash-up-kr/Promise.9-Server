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
    async sendDueReminders() {
        try {
            const result = await this.reminderService.sendDueReminders()

            if (result.dueCount === 0) return

            this.logger.log(
                `리마인드 이메일 배치를 완료했습니다. due=${result.dueCount} sent=${result.sentCount} failed=${result.failedCount}`,
            )
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.error(
                `리마인드 이메일 배치에 실패했습니다. error=${message}`,
                error instanceof Error ? error.stack : undefined,
            )
        }
    }
}
