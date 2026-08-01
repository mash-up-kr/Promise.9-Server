import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../common/security/url-security/url-security.module'
import { DatabaseModule } from '../../config/database/database.module'
import { AiModule } from '../ai/ai.module'
import { AuthModule } from '../auth/auth.module'

import { OgService } from './og/og.service'
import { OgFetcherService } from './og/og-fetcher.service'
import { LinkController } from './link.controller'
import { LinkRepository } from './link.repository'
import { LinkService } from './link.service'
import { LinkEmbeddingService } from './link-embedding.service'
import { LinkSearchService } from './link-search.service'

@Module({
    imports: [DatabaseModule, AuthModule, UrlSecurityModule, AiModule],
    controllers: [LinkController],
    providers: [
        LinkService,
        LinkRepository,
        LinkEmbeddingService,
        LinkSearchService,
        OgService,
        OgFetcherService,
    ],
    exports: [LinkService],
})
export class LinkModule {}
