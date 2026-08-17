import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../common/security/url-security/url-security.module'
import { DatabaseModule } from '../../config/database/database.module'
import { AiModule } from '../ai/ai.module'
import { AuthModule } from '../auth/auth.module'

import { LinkAnalysisQueueConsumer } from './analysis/link-analysis.consumer'
import { LinkAnalysisDispatcher } from './analysis/link-analysis.dispatcher'
import { LinkAnalysisQueuePublisher } from './analysis/link-analysis.publisher'
import { LinkAnalysisService } from './analysis/link-analysis.service'
import { LinkContentService } from './content/link-content.service'
import { EmbeddingService } from './search/embedding.service'
import { SearchService } from './search/search.service'
import { LinkController } from './link.controller'
import { LinkRepository } from './link.repository'
import { LinkService } from './link.service'

@Module({
    imports: [DatabaseModule, AiModule, AuthModule, UrlSecurityModule],
    controllers: [LinkController],
    providers: [
        LinkService,
        LinkRepository,
        EmbeddingService,
        SearchService,
        LinkAnalysisService,
        LinkAnalysisDispatcher,
        LinkAnalysisQueuePublisher,
        LinkAnalysisQueueConsumer,
        LinkContentService,
    ],
    exports: [LinkService],
})
export class LinkModule {}
