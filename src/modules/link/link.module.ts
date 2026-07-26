import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../common/security/url-security/url-security.module'
import { DatabaseModule } from '../../config/database/database.module'
import { AiModule } from '../ai/ai.module'
import { AuthModule } from '../auth/auth.module'

import { LinkContentService } from './content/link-content.service'
import { LinkController } from './link.controller'
import { LinkService } from './link.service'
import { LinkAnalysisService } from './link-analysis.service'

@Module({
    imports: [DatabaseModule, AiModule, AuthModule, UrlSecurityModule],
    controllers: [LinkController],
    providers: [LinkService, LinkAnalysisService, LinkContentService],
    exports: [LinkService],
})
export class LinkModule {}
