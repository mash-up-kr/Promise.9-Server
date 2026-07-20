import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { LlmModule } from '../../infrastructure/llm/llm.module'

import { AiMetricRepository } from './metrics/ai-metric.repository'
import { AiMetricService } from './metrics/ai-metric.service'
import { AiService } from './ai.service'

@Module({
    imports: [DatabaseModule, LlmModule],
    providers: [AiService, AiMetricService, AiMetricRepository],
    exports: [AiService],
})
export class AiModule {}
