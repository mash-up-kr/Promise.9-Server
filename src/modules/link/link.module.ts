import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../common/security/url-security/url-security.module'
import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { OgService } from './og/og.service'
import { OgFetcherService } from './og/og-fetcher.service'
import { LinkController } from './link.controller'
import { LinkService } from './link.service'

@Module({
    imports: [DatabaseModule, AuthModule, UrlSecurityModule],
    controllers: [LinkController],
    providers: [LinkService, OgService, OgFetcherService],
    exports: [LinkService],
})
export class LinkModule {}
