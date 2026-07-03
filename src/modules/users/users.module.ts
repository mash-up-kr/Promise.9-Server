import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [UsersController],
    providers: [UsersService],
})
export class UsersModule {}
