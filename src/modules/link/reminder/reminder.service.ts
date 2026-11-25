import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { ValidatedEnvironment } from '../../../config/environment'
import { EmailService } from '../../../infrastructure/email/email.service'
import { PushService } from '../../../infrastructure/push/push.service'
import { PushSendResult } from '../../../infrastructure/push/push.type'

import {
    PUSH_RECEIPT_DELAY_MS,
    PUSH_RECEIPT_TTL_MS,
    REMINDER_RETRY_WINDOW_MS,
    RETRYABLE_PUSH_ERRORS,
} from './reminder.constant'
import { ReminderRepository } from './reminder.repository'
import {
    ReminderBatchResult,
    ReminderChannelResult,
    ReminderHistory,
    ReminderTarget,
} from './reminder.type'
import { buildReminderBulkEmail } from './reminder-email.template'
import { buildReminderPushMessage } from './reminder-push.message'

type EmailClaim = {
    target: ReminderTarget
    historyId: number
    scheduledAt: Date
}
type PushClaim = {
    target: ReminderTarget
    historyId: number
    token: ReminderTarget['pushTokens'][number]
}

@Injectable()
export class ReminderService {
    private readonly logger = new Logger(ReminderService.name)

    constructor(
        private readonly reminderRepository: ReminderRepository,
        private readonly emailService: EmailService,
        private readonly pushService: PushService,
        private readonly urlSecurityService: UrlSecurityService,
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    // 채널마다 이력을 먼저 선점한 실행만 보내므로, 배치가 겹쳐도 채널·기기마다 한 번만 보낸다.
    async sendReminders(now: Date = new Date()): Promise<ReminderBatchResult> {
        const retrySince = new Date(now.getTime() - REMINDER_RETRY_WINDOW_MS)
        await this.reminderRepository.assignOccurrences(now)
        const targets = await this.reminderRepository.findTargets(
            now,
            retrySince,
        )
        const result: ReminderBatchResult = {
            targetCount: targets.length,
            finishedCount: 0,
            skippedCount: 0,
            email: { sent: 0, failed: 0 },
            push: { sent: 0, failed: 0 },
        }

        for (let offset = 0; offset < targets.length; offset += 50) {
            await this.sendChunk(
                targets.slice(offset, offset + 50),
                retrySince,
                now,
                result,
            )
        }

        result.finishedCount += await this.reminderRepository.finishExpired(
            retrySince,
            new Date(),
        )

        return result
    }

    async checkPushReceipts(now: Date = new Date()): Promise<void> {
        const histories = await this.reminderRepository.findReceiptTargets(
            new Date(now.getTime() - PUSH_RECEIPT_DELAY_MS),
            new Date(now.getTime() - PUSH_RECEIPT_TTL_MS),
        )

        if (histories.length === 0) return

        const receipts = await this.pushService.getReceipts(
            histories.map((history) => history.ticketId),
        )

        for (const history of histories) {
            const receipt = receipts[history.ticketId]

            // pending·unknown은 다음 실행에서 다시 조회한다.
            if (receipt?.status === 'ok') {
                await this.reminderRepository.recordPush(
                    history.id,
                    { status: 'RECEIPT_OK' },
                    now,
                )
            } else if (receipt?.status === 'error') {
                await this.reminderRepository.recordPush(
                    history.id,
                    { status: 'FAILED', errorCode: receipt.error },
                    now,
                )

                if (
                    receipt.error === 'DeviceNotRegistered' &&
                    history.pushTokenId
                ) {
                    await this.reminderRepository.deletePushToken(
                        history.pushTokenId,
                        history.userId,
                    )
                }
            }
        }
    }

    private async sendChunk(
        chunk: ReminderTarget[],
        retrySince: Date,
        now: Date,
        result: ReminderBatchResult,
    ) {
        // 대상 조회 뒤 바뀐 설정도 따르도록 묶음을 보내기 직전에 채널별 수신 설정을 다시 읽는다.
        const userIds = [...new Set(chunk.map((target) => target.userId))]
        const emailOff = new Set(
            await this.reminderRepository.findDisabledUserIds(userIds, 'email'),
        )
        const pushOff = new Set(
            await this.reminderRepository.findDisabledUserIds(userIds, 'push'),
        )
        const emailClaims: EmailClaim[] = []
        const pushClaims: PushClaim[] = []

        for (const target of chunk) {
            if (!emailOff.has(target.userId)) {
                await this.attempt(
                    '리마인드 이메일 준비',
                    target.linkId,
                    async () =>
                        emailClaims.push(
                            ...(await this.claimEmail(target, retrySince, now)),
                        ),
                )
            }
            if (!pushOff.has(target.userId)) {
                await this.attempt(
                    '리마인드 푸시 준비',
                    target.linkId,
                    async () =>
                        pushClaims.push(
                            ...(await this.claimPush(target, retrySince, now)),
                        ),
                )
            }
        }

        const sentLinkIds = new Set<number>()
        await this.sendEmails(emailClaims, sentLinkIds, now, result.email)
        await this.sendPushes(pushClaims, sentLinkIds, now, result.push)

        // 한 채널이라도 보냈거나 보낼 채널이 없으면 일정을 마친다. 나중에 수신을 켜도 몰아서 보내지 않는다.
        for (const target of chunk) {
            const hasChannel =
                !emailOff.has(target.userId) ||
                (!pushOff.has(target.userId) && target.pushTokens.length > 0)

            if (!target.reminderAt) continue
            if (hasChannel && !sentLinkIds.has(target.linkId)) continue
            // 건너뛴 일정도 실제로 해제했을 때만 센다.
            if (await this.markSent(target)) {
                result.finishedCount += 1
                if (!hasChannel) result.skippedCount += 1
            }
        }
    }

    private async claimEmail(
        target: ReminderTarget,
        retrySince: Date,
        now: Date,
    ): Promise<EmailClaim[]> {
        const history = target.emailHistory
        const historyId = await this.claim(
            target,
            history,
            retrySince,
            (id) => this.reminderRepository.retryEmailHistory(id, now),
            () => this.reminderRepository.insertEmailHistory(target, now),
        )
        // 마친 일정의 재시도는 예정 시각이 없어 첫 시도 시각을 보여 준다.
        const scheduledAt = target.reminderAt ?? history?.createdAt

        return historyId && scheduledAt
            ? [{ target, historyId, scheduledAt }]
            : []
    }

    private async claimPush(
        target: ReminderTarget,
        retrySince: Date,
        now: Date,
    ): Promise<PushClaim[]> {
        const claims: PushClaim[] = []

        for (const token of target.pushTokens) {
            const historyId = await this.claim(
                target,
                target.pushHistories.find(
                    (history) => history.pushTokenId === token.id,
                ),
                retrySince,
                (id) => this.reminderRepository.retryPushHistory(id, now),
                () =>
                    this.reminderRepository.insertPushHistory(
                        target,
                        token.id,
                        now,
                    ),
            )

            if (historyId) claims.push({ target, historyId, token })
        }

        return claims
    }

    // 첫 발송은 일정이 남아 있을 때만, 재시도는 기한 안의 실패만 한다.
    private async claim(
        target: ReminderTarget,
        history: ReminderHistory | null | undefined,
        retrySince: Date,
        retry: (id: number) => Promise<boolean>,
        insert: () => Promise<number | undefined>,
    ): Promise<number | undefined> {
        if (!history) return target.reminderAt ? insert() : undefined

        // 이메일 실패는 오류 코드 없이 모두 다시 보낸다.
        const isRetryable =
            history.status === 'FAILED' &&
            history.createdAt > retrySince &&
            (history.errorCode === null ||
                RETRYABLE_PUSH_ERRORS.includes(history.errorCode))

        return isRetryable && (await retry(history.id)) ? history.id : undefined
    }

    private async sendEmails(
        claims: EmailClaim[],
        sentLinkIds: Set<number>,
        now: Date,
        result: ReminderChannelResult,
    ): Promise<void> {
        const entries: (EmailClaim & { url: string })[] = []

        // 잘못된 URL 한 건이 묶음 전체를 막지 않도록 선점한 건마다 먼저 검사한다.
        for (const claim of claims) {
            const { target, historyId } = claim

            try {
                entries.push({
                    ...claim,
                    url: this.urlSecurityService
                        .parseHttpUrl(target.finalUrl ?? target.originalUrl)
                        .toString(),
                })
            } catch (error) {
                result.failed += 1
                this.logError('리마인드 이메일 URL 검사', target.linkId, error)
                await this.attempt(
                    '리마인드 이메일 결과 기록',
                    target.linkId,
                    () =>
                        this.reminderRepository.recordEmail(
                            historyId,
                            null,
                            now,
                        ),
                )
            }
        }

        if (entries.length === 0) return

        let sendResults: Awaited<ReturnType<EmailService['sendBulk']>>

        try {
            sendResults = await this.emailService.sendBulk(
                buildReminderBulkEmail(
                    entries.map(({ target, scheduledAt, url }) => ({
                        recipientEmail: target.recipientEmail,
                        title: target.title,
                        linkId: target.linkId,
                        reminderAt: scheduledAt,
                        createdAt: target.createdAt,
                        memo: target.memo,
                        folderName: target.folderName,
                        folderColor: target.folderColor,
                        url,
                    })),
                    this.config.get('EMAIL_ASSET_BASE_URL', { infer: true }),
                ),
            )
        } catch (error) {
            // 발송 여부를 알 수 없는 이력은 PENDING으로 남겨 다시 보내지 않는다.
            this.logError(
                '리마인드 이메일 발송',
                entries[0].target.linkId,
                error,
            )
            return
        }

        for (const [index, { target, historyId }] of entries.entries()) {
            const sendResult = sendResults[index]
            const messageId =
                sendResult?.Status === 'SUCCESS'
                    ? sendResult.MessageId
                    : undefined

            if (messageId) {
                sentLinkIds.add(target.linkId)
                result.sent += 1
            } else {
                result.failed += 1
                this.logger.error(
                    `리마인드 이메일 발송에 실패했습니다. linkId=${target.linkId} status=${sendResult?.Status ?? 'FAILED'}`,
                )
            }

            await this.attempt('리마인드 이메일 결과 기록', target.linkId, () =>
                this.reminderRepository.recordEmail(
                    historyId,
                    messageId ?? null,
                    now,
                ),
            )
        }
    }

    private async sendPushes(
        claims: PushClaim[],
        sentLinkIds: Set<number>,
        now: Date,
        result: ReminderChannelResult,
    ): Promise<void> {
        if (claims.length === 0) return

        const sendable: PushClaim[] = []
        let sendResults: PushSendResult[]

        try {
            // 조회 뒤 로그아웃·계정 전환된 기기로 이전 계정의 링크가 가지 않도록 보내기 직전에 소유자를 다시 확인한다.
            const owners = new Map(
                (
                    await this.reminderRepository.findPushTokenOwners(
                        claims.map(({ token }) => token.id),
                    )
                ).map(({ id, userId }) => [id, userId]),
            )

            for (const claim of claims) {
                if (owners.get(claim.token.id) === claim.target.userId) {
                    sendable.push(claim)
                    continue
                }

                result.failed += 1
                await this.attempt(
                    '리마인드 푸시 결과 기록',
                    claim.target.linkId,
                    () =>
                        this.reminderRepository.recordPush(
                            claim.historyId,
                            { status: 'FAILED', errorCode: 'TOKEN_NOT_OWNED' },
                            now,
                        ),
                )
            }

            if (sendable.length === 0) return

            sendResults = await this.pushService.send(
                sendable.map(({ target, token }) =>
                    buildReminderPushMessage(token.token, target),
                ),
            )
        } catch (error) {
            this.logError('리마인드 푸시 발송', claims[0].target.linkId, error)
            return
        }

        for (const [
            index,
            { target, historyId, token },
        ] of sendable.entries()) {
            const sendResult = sendResults[index]

            if (sendResult.status === 'accepted') {
                sentLinkIds.add(target.linkId)
                result.sent += 1
            } else {
                result.failed += 1
                this.logger.error(
                    `리마인드 푸시 발송에 실패했습니다. linkId=${target.linkId} error=${sendResult.error}`,
                )
            }

            await this.attempt(
                '리마인드 푸시 결과 기록',
                target.linkId,
                async () => {
                    if (sendResult.status === 'accepted') {
                        await this.reminderRepository.recordPush(
                            historyId,
                            {
                                status: 'ACCEPTED',
                                ticketId: sendResult.ticketId,
                            },
                            now,
                        )
                        return
                    }

                    await this.reminderRepository.recordPush(
                        historyId,
                        {
                            status:
                                sendResult.status === 'unknown'
                                    ? 'UNKNOWN'
                                    : 'FAILED',
                            errorCode: sendResult.error,
                        },
                        now,
                    )

                    if (sendResult.error === 'DeviceNotRegistered') {
                        await this.reminderRepository.deletePushToken(
                            token.id,
                            target.userId,
                        )
                    }
                },
            )
        }
    }

    private async markSent(target: ReminderTarget) {
        try {
            // 배치 중 사용자가 바꾼 더 최근 수정 시각을 되돌리지 않도록 해제하는 시점의 시각을 쓴다.
            const marked = await this.reminderRepository.markSent(
                target.linkId,
                target.occurrenceId,
                new Date(),
            )

            if (!marked) {
                this.logger.warn(
                    `리마인드 일정이 그사이 변경되어 기존 일정을 해제하지 않았습니다. linkId=${target.linkId}`,
                )
            }

            return marked
        } catch (error) {
            this.logError('리마인드 일정 종료', target.linkId, error)

            return false
        }
    }

    // 한 건의 실패가 같은 묶음의 나머지 처리를 막지 않게 한다.
    private async attempt(
        action: string,
        linkId: number,
        run: () => Promise<unknown>,
    ): Promise<void> {
        try {
            await run()
        } catch (error) {
            this.logError(action, linkId, error)
        }
    }

    private logError(action: string, linkId: number, error: unknown) {
        const message = error instanceof Error ? error.message : String(error)

        this.logger.error(
            `${action}에 실패했습니다. linkId=${linkId} error=${message}`,
            error instanceof Error ? error.stack : undefined,
        )
    }
}
