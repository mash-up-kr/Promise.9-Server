import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'

import { LinkController } from './link.controller'
import { LinkService } from './link.service'

@Module({
    imports: [DatabaseModule],
    controllers: [LinkController],
    providers: [LinkService],
    exports: [LinkService],
})
export class LinkModule {}
