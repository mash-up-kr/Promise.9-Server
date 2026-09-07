import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { EmailModule } from '../../infrastructure/email/email.module'
import { AiModule } from '../ai/ai.module'
import { AuthModule } from '../auth/auth.module'

import { LinkAnalysisModule } from './analysis/link-analysis.module'
import { LinkAnalysisQueuePublisher } from './analysis/link-analysis.publisher'
import { LinkOutboxRepository } from './analysis/link-outbox.repository'
import { LinkContentModule } from './content/link-content.module'
import { EmbeddingService } from './embedding/embedding.service'
import { RelatedLinkRepository } from './related/related-link.repository'
import { RelatedLinkService } from './related/related-link.service'
import { ReminderRepository } from './reminder/reminder.repository'
import { ReminderScheduler } from './reminder/reminder.scheduler'
import { ReminderService } from './reminder/reminder.service'
import { SearchRepository } from './search/search.repository'
import { SearchService } from './search/search.service'
import { LinkController } from './link.controller'
import { LinkRepository } from './link.repository'
import { LinkService } from './link.service'

@Module({
    imports: [
        DatabaseModule,
        LinkAnalysisModule,
        LinkContentModule,
        AiModule,
        AuthModule,
        EmailModule,
    ],
    controllers: [LinkController],
    providers: [
        LinkService,
        LinkRepository,
        EmbeddingService,
        SearchRepository,
        SearchService,
        LinkAnalysisQueuePublisher,
        LinkOutboxRepository,
        RelatedLinkRepository,
        RelatedLinkService,
        ReminderRepository,
        ReminderService,
        ReminderScheduler,
    ],
    exports: [LinkService],
})
export class LinkModule {}
