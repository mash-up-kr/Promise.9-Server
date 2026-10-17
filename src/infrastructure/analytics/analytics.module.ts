import { Module } from '@nestjs/common'

import { AnalyticsService } from './analytics.service'
import { FirehoseTransport } from './firehose.transport'

@Module({
    providers: [AnalyticsService, FirehoseTransport],
    exports: [AnalyticsService],
})
export class AnalyticsModule {}
