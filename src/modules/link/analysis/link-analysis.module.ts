import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../../config/database/database.module'
import { SqsModule } from '../../../infrastructure/sqs/sqs.module'
import { AiModule } from '../../ai/ai.module'
import { ImageColorModule } from '../../image-color/image-color.module'
import { LinkContentModule } from '../content/link-content.module'
import { LinkContentService } from '../content/link-content.service'
import { LINK_CONTENT_COLLECTOR } from '../content/link-content.type'

import { LinkAnalysisQueueConsumer } from './link-analysis.consumer'
import { LinkAnalysisService } from './link-analysis.service'
import { LINK_ANALYSIS_EXECUTOR } from './link-analysis.type'
import { LinkJobRepository } from './link-job.repository'

// 워커의 조립 지점. 브라우저 수집기는 이 모듈의 collector provider를 바꿔 연결한다.
// HTTP 컨트롤러, 인증, 리마인드 스케줄러, Outbox Publisher는 로드하지 않는다.
@Module({
    imports: [
        DatabaseModule,
        SqsModule,
        AiModule,
        ImageColorModule,
        LinkContentModule,
    ],
    providers: [
        LinkJobRepository,
        LinkAnalysisService,
        { provide: LINK_CONTENT_COLLECTOR, useExisting: LinkContentService },
        { provide: LINK_ANALYSIS_EXECUTOR, useExisting: LinkAnalysisService },
        LinkAnalysisQueueConsumer,
    ],
})
export class LinkAnalysisModule {}
