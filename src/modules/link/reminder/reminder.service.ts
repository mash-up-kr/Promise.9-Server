import { Injectable, Logger } from '@nestjs/common'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { EmailService } from '../../../infrastructure/email/email.service'

import { ReminderRepository } from './reminder.repository'
import { ReminderBatchResult, ReminderEmailTarget } from './reminder.type'
import { buildReminderBulkEmail } from './reminder-email.template'

@Injectable()
export class ReminderService {
    private readonly logger = new Logger(ReminderService.name)

    constructor(
        private readonly reminderRepository: ReminderRepository,
        private readonly emailService: EmailService,
        private readonly urlSecurityService: UrlSecurityService,
    ) {}

    async sendDueReminders(
        batchStartedAt: Date = new Date(),
    ): Promise<ReminderBatchResult> {
        const reminders = await this.reminderRepository.findDue(batchStartedAt)
        let sentCount = 0

        for (let offset = 0; offset < reminders.length; offset += 50) {
            const entries = reminders.slice(offset, offset + 50)
            const sendResults = await this.emailService.sendBulk(
                buildReminderBulkEmail(
                    entries.map((reminder) => ({
                        recipientEmail: reminder.recipientEmail,
                        title: reminder.title,
                        url: this.urlSecurityService
                            .parseHttpUrl(
                                reminder.finalUrl ?? reminder.originalUrl,
                            )
                            .toString(),
                    })),
                ),
            )

            for (const [index, reminder] of entries.entries()) {
                const sendResult = sendResults[index]

                if (sendResult?.Status !== 'SUCCESS' || !sendResult.MessageId) {
                    this.logger.error(
                        `리마인드 이메일 발송에 실패했습니다. linkId=${reminder.linkId} status=${sendResult?.Status ?? 'FAILED'}`,
                    )
                    continue
                }

                if (await this.markSent(reminder)) {
                    sentCount += 1
                }
            }
        }

        return {
            dueCount: reminders.length,
            sentCount,
            failedCount: reminders.length - sentCount,
        }
    }

    private async markSent(reminder: ReminderEmailTarget): Promise<boolean> {
        try {
            const marked = await this.reminderRepository.markSent(
                reminder.linkId,
                reminder.reminderAt,
                new Date(),
            )

            if (!marked) {
                this.logger.warn(
                    `발송 후 리마인드가 변경되어 기존 일정을 해제하지 않았습니다. linkId=${reminder.linkId}`,
                )
            }

            return true
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.error(
                `리마인드 이메일 처리에 실패했습니다. linkId=${reminder.linkId} error=${message}`,
                error instanceof Error ? error.stack : undefined,
            )

            return false
        }
    }
}
