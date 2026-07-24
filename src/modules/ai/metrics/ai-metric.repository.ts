import { Injectable } from '@nestjs/common'

import { DatabaseService } from '../../../config/database/database.service'

import { aiMetrics } from './ai-metric.schema'

// AI 지표(ai_metrics) 테이블 전용 데이터 접근 계층.
@Injectable()
export class AiMetricRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async insert(values: typeof aiMetrics.$inferInsert) {
        const [row] = await this.db.insert(aiMetrics).values(values).returning()

        return row
    }
}
