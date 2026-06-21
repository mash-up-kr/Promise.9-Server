import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateEnvironment } from './config/environment'
import { DatabaseModule } from './database/database.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnvironment,
        }),
        DatabaseModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
