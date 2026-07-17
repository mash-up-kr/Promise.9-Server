import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { DatabaseService } from '../../../config/database/database.service'
import { AI_METRIC_STATUS } from '../ai.constants'

import { aiMetrics } from './ai-metric.schema'
import { AiMetricRecordInput } from './ai-metric.type'

@Injectable()
export class AiMetricService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async record(input: AiMetricRecordInput) {
        const [row] = await this.db
            .insert(aiMetrics)
            .values({
                id: randomUUID(),
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                status: input.status,
                modelProvider: input.modelProvider,
                modelName: input.modelName,
                promptKey: input.promptKey ?? null,
                inputTokens: input.inputTokens ?? null,
                outputTokens: input.outputTokens ?? null,
                generatedResult:
                    input.status === AI_METRIC_STATUS.FAILED
                        ? null
                        : input.generatedResult,
                ttlbMs: input.ttlbMs,
                errorCode:
                    input.status === AI_METRIC_STATUS.FAILED
                        ? input.errorCode
                        : null,
                errorMessage:
                    input.status === AI_METRIC_STATUS.FAILED
                        ? input.errorMessage
                        : null,
            })
            .returning()

        return row
    }
}
