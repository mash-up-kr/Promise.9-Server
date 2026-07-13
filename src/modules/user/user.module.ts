import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
