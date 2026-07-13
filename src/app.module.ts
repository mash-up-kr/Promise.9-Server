import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { DatabaseModule } from './config/database/database.module'
import { validateEnvironment } from './config/environment'
import { AuthModule } from './modules/auth/auth.module'
import { FolderModule } from './modules/folder/folder.module'
import { LinkModule } from './modules/link/link.module'
import { UserModule } from './modules/user/user.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnvironment,
        }),
        DatabaseModule,
        FolderModule,
        LinkModule,
        AuthModule,
        UserModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
