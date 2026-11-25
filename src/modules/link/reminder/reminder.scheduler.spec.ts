import { Logger } from '@nestjs/common'

import { ReminderScheduler } from './reminder.scheduler'
import { ReminderService } from './reminder.service'

describe('ReminderScheduler', () => {
    it('리마인드를 보낸 뒤 푸시 receipt를 조회하고 처리 건수를 기록한다', async () => {
        const reminderService = {
            sendReminders: jest.fn().mockResolvedValue({
                targetCount: 4,
                finishedCount: 3,
                skippedCount: 1,
                email: { sent: 2, failed: 1 },
                push: { sent: 3, failed: 0 },
            }),
            checkPushReceipts: jest.fn().mockResolvedValue(undefined),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation()
        const scheduler = new ReminderScheduler(
            reminderService as unknown as ReminderService,
        )

        await scheduler.sendReminders()

        expect(reminderService.sendReminders).toHaveBeenCalledTimes(1)
        expect(reminderService.checkPushReceipts).toHaveBeenCalledTimes(1)
        expect(loggerSpy).toHaveBeenCalledWith(
            '리마인드 배치를 완료했습니다. target=4 finished=3 skipped=1 email.sent=2 email.failed=1 push.sent=3 push.failed=0',
        )

        loggerSpy.mockRestore()
    })

    it('배치 실패를 기록하고 receipt 조회는 계속하며 다음 실행을 위해 예외를 삼킨다', async () => {
        const reminderService = {
            sendReminders: jest.fn().mockRejectedValue(new Error('DB error')),
            checkPushReceipts: jest
                .fn()
                .mockRejectedValue(new Error('Expo error')),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        const scheduler = new ReminderScheduler(
            reminderService as unknown as ReminderService,
        )

        await expect(scheduler.sendReminders()).resolves.toBeUndefined()
        expect(reminderService.checkPushReceipts).toHaveBeenCalledTimes(1)
        expect(loggerSpy).toHaveBeenCalledWith(
            '리마인드 배치에 실패했습니다. error=DB error',
            expect.any(String),
        )
        expect(loggerSpy).toHaveBeenCalledWith(
            '리마인드 푸시 receipt 조회에 실패했습니다. error=Expo error',
            expect.any(String),
        )

        loggerSpy.mockRestore()
    })
})
