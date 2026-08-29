import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../common/security/url-security/url-security.module'
import { DatabaseModule } from '../../config/database/database.module'
import { AiModule } from '../ai/ai.module'
import { AuthModule } from '../auth/auth.module'
import { ImageColorModule } from '../image-color/image-color.module'

import { LinkAnalysisService } from './analysis/link-analysis.service'
import { LinkContentService } from './content/link-content.service'
import { EmbeddingService } from './embedding/embedding.service'
import { RelatedLinkRepository } from './related/related-link.repository'
import { RelatedLinkService } from './related/related-link.service'
import { SearchRepository } from './search/search.repository'
import { SearchService } from './search/search.service'
import { LinkController } from './link.controller'
import { LinkRepository } from './link.repository'
import { LinkService } from './link.service'

@Module({
    imports: [
        DatabaseModule,
        AiModule,
        AuthModule,
        UrlSecurityModule,
        ImageColorModule,
    ],
    controllers: [LinkController],
    providers: [
        LinkService,
        LinkRepository,
        EmbeddingService,
        SearchRepository,
        SearchService,
        LinkAnalysisService,
        LinkContentService,
        RelatedLinkRepository,
        RelatedLinkService,
    ],
    exports: [LinkService],
})
export class LinkModule {}
