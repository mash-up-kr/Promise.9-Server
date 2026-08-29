import { Logger } from '@nestjs/common'

import { ReminderScheduler } from './reminder.scheduler'
import { ReminderService } from './reminder.service'

describe('ReminderScheduler', () => {
    it('리마인드 배치를 실행하고 처리 건수를 기록한다', async () => {
        const reminderService = {
            sendDueReminders: jest.fn().mockResolvedValue({
                dueCount: 3,
                sentCount: 2,
                failedCount: 1,
            }),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation()
        const scheduler = new ReminderScheduler(
            reminderService as unknown as ReminderService,
        )

        await scheduler.sendDueReminders()

        expect(reminderService.sendDueReminders).toHaveBeenCalledTimes(1)
        expect(loggerSpy).toHaveBeenCalledWith(
            '리마인드 이메일 배치를 완료했습니다. due=3 sent=2 failed=1',
        )

        loggerSpy.mockRestore()
    })

    it('배치 실행 실패를 기록하고 다음 실행을 위해 예외를 삼킨다', async () => {
        const reminderService = {
            sendDueReminders: jest
                .fn()
                .mockRejectedValue(new Error('DB error')),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        const scheduler = new ReminderScheduler(
            reminderService as unknown as ReminderService,
        )

        await expect(scheduler.sendDueReminders()).resolves.toBeUndefined()
        expect(loggerSpy).toHaveBeenCalledWith(
            '리마인드 이메일 배치에 실패했습니다. error=DB error',
            expect.any(String),
        )

        loggerSpy.mockRestore()
    })
})
