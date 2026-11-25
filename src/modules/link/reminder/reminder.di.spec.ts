import { ConfigService } from '@nestjs/config'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { DatabaseService } from '../../../config/database/database.service'
import { EmailService } from '../../../infrastructure/email/email.service'
import { PushService } from '../../../infrastructure/push/push.service'

import { ReminderRepository } from './reminder.repository'
import { ReminderService } from './reminder.service'

// 실제 SDK는 ESM이라 jest에서 불러오지 않는다.
jest.mock('expo-server-sdk', () => ({ Expo: jest.fn() }))

// 생성자 의존성을 타입 전용 import로 바꾸면 메타데이터가 Object가 되어 Nest가 주입하지 못한다.
describe('리마인드 provider 주입 메타데이터', () => {
    it.each([
        [
            ReminderService,
            [
                ReminderRepository,
                EmailService,
                PushService,
                UrlSecurityService,
                ConfigService,
            ],
        ],
        [ReminderRepository, [DatabaseService]],
    ])('%p는 실제 클래스로 의존성을 선언한다', (provider, dependencies) => {
        expect(Reflect.getMetadata('design:paramtypes', provider)).toEqual(
            dependencies,
        )
    })
})
