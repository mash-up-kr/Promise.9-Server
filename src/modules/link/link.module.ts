import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { LinkController } from './link.controller'
import { LinkService } from './link.service'

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [LinkController],
    providers: [LinkService],
    exports: [LinkService],
})
export class LinkModule {}
