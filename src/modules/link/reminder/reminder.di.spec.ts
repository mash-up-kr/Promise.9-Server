import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { DatabaseService } from '../../../config/database/database.service'
import { EmailService } from '../../../infrastructure/email/email.service'
import { PushService } from '../../../infrastructure/push/push.service'

import { ReminderRepository } from './reminder.repository'
import { ReminderScheduler } from './reminder.scheduler'
import { ReminderService } from './reminder.service'

// 실제 SDK는 ESM이라 jest에서 불러오지 않는다.
jest.mock('expo-server-sdk', () => ({ Expo: jest.fn() }))

// 생성자 의존성을 타입 전용 import로 바꾸면 메타데이터가 Object가 되어 Nest가 앱을 띄우지 못한다.
describe('리마인드 provider 주입', () => {
    it('Nest 모듈에서 리마인드 provider를 실제 클래스 토큰으로 주입한다', async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ReminderScheduler,
                ReminderService,
                ReminderRepository,
                UrlSecurityService,
                { provide: ConfigService, useValue: new ConfigService() },
                { provide: DatabaseService, useValue: {} },
                { provide: EmailService, useValue: {} },
                { provide: PushService, useValue: {} },
            ],
        }).compile()

        expect(moduleRef.get(ReminderScheduler)).toBeInstanceOf(
            ReminderScheduler,
        )
        expect(moduleRef.get(ReminderService)).toBeInstanceOf(ReminderService)
    })
})
