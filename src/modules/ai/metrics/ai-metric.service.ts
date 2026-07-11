import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { POSTGRES_ERROR_CODE } from '../../../common/constants/postgres'
import { DatabaseService } from '../../../config/database/database.service'
import {
    AI_METRIC_ATTEMPT_INSERT_MAX_RETRIES,
    AI_METRIC_ATTEMPT_UNIQUE_INDEX,
    AI_METRIC_STATUS,
} from '../ai.constants'

import { aiMetrics } from './ai-metric.schema'
import { AiMetricRecordInput } from './ai-metric.type'

@Injectable()
export class AiMetricService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async record(input: AiMetricRecordInput) {
        for (
            let trial = 1;
            trial <= AI_METRIC_ATTEMPT_INSERT_MAX_RETRIES;
            trial += 1
        ) {
            try {
                return await this.insertRecord(input)
            } catch (error) {
                const shouldRetry =
                    trial < AI_METRIC_ATTEMPT_INSERT_MAX_RETRIES &&
                    this.isAttemptNumberConflict(error)

                if (!shouldRetry) {
                    throw error
                }
            }
        }

        throw new Error('AI 메트릭 기록에 실패했습니다.')
    }

    private async insertRecord(input: AiMetricRecordInput) {
        const [attempt] = await this.db
            .select({
                nextAttemptNumber: sql<number>`coalesce(max(${aiMetrics.attemptNumber}), 0) + 1`,
            })
            .from(aiMetrics)
            .where(
                and(
                    eq(aiMetrics.userLinkId, input.userLinkId),
                    eq(aiMetrics.taskType, input.taskType),
                ),
            )

        const [row] = await this.db
            .insert(aiMetrics)
            .values({
                id: randomUUID(),
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                attemptNumber: attempt.nextAttemptNumber,
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

    private isAttemptNumberConflict(error: unknown) {
        const code = this.getErrorString(error, 'code')
        const constraint =
            this.getErrorString(error, 'constraint_name') ??
            this.getErrorString(error, 'constraint')

        return (
            code === POSTGRES_ERROR_CODE.UNIQUE_VIOLATION &&
            constraint === AI_METRIC_ATTEMPT_UNIQUE_INDEX
        )
    }

    private getErrorString(error: unknown, key: string) {
        let current = error
        const visited = new Set<object>()

        while (typeof current === 'object' && current !== null) {
            if (visited.has(current)) {
                return undefined
            }

            visited.add(current)

            if (key in current) {
                const value = (current as Record<string, unknown>)[key]

                if (typeof value === 'string') {
                    return value
                }
            }

            current = 'cause' in current ? current.cause : undefined
        }

        return undefined
    }
}
