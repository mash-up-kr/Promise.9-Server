import { Logger } from '@nestjs/common'
import { BulkEmailEntryResult } from '@aws-sdk/client-sesv2'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { EmailService } from '../../../infrastructure/email/email.service'
import { SendBulkEmailInput } from '../../../infrastructure/email/email.type'

import { ReminderRepository } from './reminder.repository'
import { ReminderService } from './reminder.service'
import { ReminderEmailTarget } from './reminder.type'

const createReminder = (
    values: Partial<ReminderEmailTarget> = {},
): ReminderEmailTarget => ({
    linkId: 1,
    recipientEmail: 'user@example.com',
    title: '읽어볼 링크',
    originalUrl: 'https://example.com/original',
    finalUrl: 'https://example.com/final',
    reminderAt: new Date('2026-08-24T03:00:00.000Z'),
    ...values,
})

describe('ReminderService', () => {
    const urlSecurityService = new UrlSecurityService()

    it('발송 시각이 지난 리마인드를 수신자별로 발송하고 해제한다', async () => {
        const batchStartedAt = new Date('2026-08-24T03:15:00.000Z')
        const reminders = [
            createReminder(),
            createReminder({
                linkId: 2,
                recipientEmail: 'other@example.com',
                finalUrl: null,
            }),
        ]
        const reminderRepository = {
            findEmailTargets: jest.fn().mockResolvedValue(reminders),
            markSent: jest.fn().mockResolvedValue(true),
        }
        const sendBulkMock = jest.fn<
            Promise<BulkEmailEntryResult[]>,
            [input: SendBulkEmailInput]
        >()
        sendBulkMock.mockResolvedValue([
            { Status: 'SUCCESS', MessageId: 'first-message-id' },
            { Status: 'SUCCESS', MessageId: 'second-message-id' },
        ])
        const emailService = { sendBulk: sendBulkMock }
        const service = new ReminderService(
            reminderRepository as unknown as ReminderRepository,
            emailService as unknown as EmailService,
            urlSecurityService,
        )

        const result = await service.sendReminderEmails(batchStartedAt)

        expect(reminderRepository.findEmailTargets).toHaveBeenCalledWith(
            batchStartedAt,
        )
        expect(sendBulkMock).toHaveBeenCalledTimes(1)
        const sentEmail = sendBulkMock.mock.calls[0]?.[0]
        expect(sentEmail?.entries[0]).toMatchObject({
            to: 'user@example.com',
            templateData: {
                linkTitle: '읽어볼 링크',
                linkUrl: 'https://example.com/final',
                linkUrlText: 'https://example.com/final',
            },
        })
        expect(sentEmail?.entries[1]).toMatchObject({
            to: 'other@example.com',
            templateData: {
                linkUrl: 'https://example.com/original',
                linkUrlText: 'https://example.com/original',
            },
        })
        expect(sentEmail?.text).toContain('{{linkTitleText}}\n{{linkUrlText}}')

        expect(sentEmail?.subject).toBe('저장해둔 링크 지금 볼까요?')
        expect(sentEmail?.html).toContain('{{linkTitle}}')
        expect(sentEmail?.html).not.toContain('{{motionGifUrl}}')
        expect(sentEmail?.attachments?.[0]).toMatchObject({
            fileName: 'link-reminder-motion-poster.png',
            contentType: 'image/png',
            disposition: 'inline',
            contentId: 'link-reminder-poster',
        })
        expect(reminderRepository.markSent).toHaveBeenCalledTimes(2)
        expect(result).toEqual({
            targetCount: 2,
            sentCount: 2,
            failedCount: 0,
        })
    })

    it('50건씩 발송하고 성공한 묶음을 다음 발송 전에 해제한다', async () => {
        const reminders = Array.from({ length: 51 }, (_, index) =>
            createReminder({
                linkId: index + 1,
                recipientEmail: `user-${index + 1}@example.com`,
            }),
        )
        const reminderRepository = {
            findEmailTargets: jest.fn().mockResolvedValue(reminders),
            markSent: jest.fn().mockResolvedValue(true),
        }
        const sendBulkMock = jest.fn<
            Promise<BulkEmailEntryResult[]>,
            [input: SendBulkEmailInput]
        >()
        sendBulkMock
            .mockImplementationOnce((input) =>
                Promise.resolve(
                    input.entries.map((_, index) => ({
                        Status: 'SUCCESS',
                        MessageId: `message-${index + 1}`,
                    })),
                ),
            )
            .mockImplementationOnce((input) => {
                expect(reminderRepository.markSent).toHaveBeenCalledTimes(50)

                return Promise.resolve(
                    input.entries.map(() => ({
                        Status: 'SUCCESS',
                        MessageId: 'message-51',
                    })),
                )
            })
        const emailService = { sendBulk: sendBulkMock }
        const service = new ReminderService(
            reminderRepository as unknown as ReminderRepository,
            emailService as unknown as EmailService,
            urlSecurityService,
        )

        const result = await service.sendReminderEmails()

        expect(sendBulkMock).toHaveBeenCalledTimes(2)
        expect(sendBulkMock.mock.calls[0]?.[0].entries).toHaveLength(50)
        expect(sendBulkMock.mock.calls[1]?.[0].entries).toHaveLength(1)
        expect(reminderRepository.markSent).toHaveBeenCalledTimes(51)
        expect(result).toEqual({
            targetCount: 51,
            sentCount: 51,
            failedCount: 0,
        })
    })

    it('한 건의 발송이 실패해도 나머지 리마인드를 계속 처리한다', async () => {
        const reminders = [
            createReminder(),
            createReminder({
                linkId: 2,
                recipientEmail: 'other@example.com',
            }),
        ]
        const reminderRepository = {
            findEmailTargets: jest.fn().mockResolvedValue(reminders),
            markSent: jest.fn().mockResolvedValue(true),
        }
        const sendBulkMock = jest.fn<
            Promise<BulkEmailEntryResult[]>,
            [input: SendBulkEmailInput]
        >()
        sendBulkMock.mockResolvedValue([
            { Status: 'TRANSIENT_FAILURE' },
            { Status: 'SUCCESS', MessageId: 'message-id' },
        ])
        const emailService = { sendBulk: sendBulkMock }
        const loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        const service = new ReminderService(
            reminderRepository as unknown as ReminderRepository,
            emailService as unknown as EmailService,
            urlSecurityService,
        )

        const result = await service.sendReminderEmails()

        expect(sendBulkMock).toHaveBeenCalledTimes(1)
        expect(reminderRepository.markSent).toHaveBeenCalledTimes(1)
        expect(reminderRepository.markSent).toHaveBeenCalledWith(
            2,
            reminders[1].reminderAt,
            expect.any(Date),
        )
        expect(result).toEqual({
            targetCount: 2,
            sentCount: 1,
            failedCount: 1,
        })
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('linkId=1'),
        )

        loggerErrorSpy.mockRestore()
    })

    it('고정 템플릿의 링크 제목을 escape하고 URL을 삽입한다', async () => {
        const reminderRepository = {
            findEmailTargets: jest.fn().mockResolvedValue([
                createReminder({
                    title: '<script>alert("xss")</script>',
                    originalUrl: 'https://example.com/original',
                    finalUrl: null,
                }),
            ]),
            markSent: jest.fn().mockResolvedValue(true),
        }
        const sendBulkMock = jest.fn<
            Promise<BulkEmailEntryResult[]>,
            [input: SendBulkEmailInput]
        >()
        sendBulkMock.mockResolvedValue([
            { Status: 'SUCCESS', MessageId: 'message-id' },
        ])
        const emailService = { sendBulk: sendBulkMock }
        const service = new ReminderService(
            reminderRepository as unknown as ReminderRepository,
            emailService as unknown as EmailService,
            urlSecurityService,
        )

        await service.sendReminderEmails()

        const sentEmail = sendBulkMock.mock.calls[0]?.[0]
        const templateData = sentEmail?.entries[0]?.templateData

        expect(templateData?.linkTitle).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
        )
        expect(templateData?.linkTitleText).toBe(
            '<script>alert("xss")</script>',
        )
        expect(templateData?.linkUrl).toBe('https://example.com/original')
        expect(templateData?.linkUrlText).toBe('https://example.com/original')
        expect(sentEmail?.html).not.toContain('{{motionGifUrl}}')
    })
})
