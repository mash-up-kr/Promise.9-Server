#!/usr/bin/env bun
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { UrlSecurityModule } from '../src/common/security/url-security/url-security.module'
import { DatabaseModule } from '../src/config/database/database.module'
import { validateEnvironment } from '../src/config/environment'
import { EmailModule } from '../src/infrastructure/email/email.module'
import { ReminderRepository } from '../src/modules/link/reminder/reminder.repository'
import { ReminderService } from '../src/modules/link/reminder/reminder.service'

import {
    printError,
    printKeyValue,
    printSuccess,
    printTitle,
} from './script-log'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnvironment,
        }),
        DatabaseModule,
        EmailModule,
        UrlSecurityModule,
    ],
    providers: [ReminderRepository, ReminderService],
})
class ReminderBatchModule {}

async function main() {
    const app = await NestFactory.createApplicationContext(ReminderBatchModule)

    try {
        printTitle('⏰ 링크 리마인드 이메일 배치')

        const result = await app.get(ReminderService).sendDueReminders()

        printKeyValue('발송 대상', result.dueCount)
        printKeyValue('발송 성공', result.sentCount)
        printKeyValue('발송 실패', result.failedCount)

        if (result.failedCount > 0) {
            printError(`${result.failedCount}건의 이메일 발송에 실패했습니다.`)
            process.exitCode = 1
            return
        }

        printSuccess('링크 리마인드 이메일 배치가 완료되었습니다.')
    } finally {
        await app.close()
    }
}

void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
