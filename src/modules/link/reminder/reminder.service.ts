import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { ValidatedEnvironment } from '../../../config/environment'
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
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    async sendReminderEmails(
        batchStartedAt: Date = new Date(),
    ): Promise<ReminderBatchResult> {
        const reminders =
            await this.reminderRepository.findEmailTargets(batchStartedAt)
        // 푸시 발송(#153) 전까지는 이메일만 보낼 채널로 본다.
        const deliverable = reminders.filter(
            (reminder) => reminder.emailEnabled,
        )
        let sentCount = 0
        let skippedCount = 0

        // 받을 채널이 없는 일정은 보낸 경우와 같이 마쳐 나중에 수신을 켜도 몰아서 보내지 않는다.
        for (const reminder of reminders) {
            if (!reminder.emailEnabled && (await this.markSent(reminder))) {
                skippedCount += 1
            }
        }

        for (let offset = 0; offset < deliverable.length; offset += 50) {
            const entries = deliverable.slice(offset, offset + 50)
            const sendResults = await this.emailService.sendBulk(
                buildReminderBulkEmail(
                    entries.map((reminder) => ({
                        recipientEmail: reminder.recipientEmail,
                        title: reminder.title,
                        linkId: reminder.linkId,
                        reminderAt: reminder.reminderAt,
                        createdAt: reminder.createdAt,
                        memo: reminder.memo,
                        folderName: reminder.folderName,
                        folderColor: reminder.folderColor,
                        url: this.urlSecurityService
                            .parseHttpUrl(
                                reminder.finalUrl ?? reminder.originalUrl,
                            )
                            .toString(),
                    })),
                    this.config.get('EMAIL_ASSET_BASE_URL', { infer: true }),
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
            targetCount: reminders.length,
            sentCount,
            skippedCount,
            failedCount: reminders.length - sentCount - skippedCount,
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
