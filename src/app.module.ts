import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'

import { DatabaseModule } from './config/database/database.module'
import { validateEnvironment } from './config/environment'
import { SqsModule } from './infrastructure/sqs/sqs.module'
import { AuthModule } from './modules/auth/auth.module'
import { FolderModule } from './modules/folder/folder.module'
import { LinkModule } from './modules/link/link.module'
import { RecommendationModule } from './modules/recommendation/recommendation.module'
import { UserModule } from './modules/user/user.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnvironment,
        }),
        ScheduleModule.forRoot(),
        DatabaseModule,
        SqsModule,
        FolderModule,
        LinkModule,
        RecommendationModule,
        AuthModule,
        UserModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
