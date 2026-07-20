import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { AI_METRIC_STATUS } from '../ai.constants'

import { AiMetricRepository } from './ai-metric.repository'
import { AiMetricRecordInput } from './ai-metric.type'

@Injectable()
export class AiMetricService {
    constructor(private readonly aiMetricRepository: AiMetricRepository) {}

    async record(input: AiMetricRecordInput) {
        return this.aiMetricRepository.insert({
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
    }
}
