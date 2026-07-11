import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'

import {
    LlmConfigurationError,
    LlmError,
} from '../../infrastructure/llm/llm.exception'
import { LlmService } from '../../infrastructure/llm/llm.service'
import {
    LlmGenerateObjectResult,
    LlmGenerateTextResult,
    LlmObjectSchema,
    LlmResolvedTarget,
    LlmTargetOptions,
    LlmUsage,
} from '../../infrastructure/llm/llm.type'

import { AiMetricService } from './metrics/ai-metric.service'
import { AiMetricGeneratedResult } from './metrics/ai-metric.type'
import {
    AI_FAILURE_ERROR_CODE,
    AI_METRIC_STATUS,
    AI_TASK_RESPONSE_SCHEMA_NAME,
    AiTaskType,
} from './ai.constants'
import { AiGenerationError, AiUseCaseNotImplementedError } from './ai.exception'

type AiGenerateBaseInput = {
    userLinkId: number
    taskType: AiTaskType
    promptKey?: string
    llm?: LlmTargetOptions
    system?: string
    prompt: string
}

type AiGenerateTextInput = AiGenerateBaseInput

type AiGenerateObjectInput<T extends AiMetricGeneratedResult> =
    AiGenerateBaseInput & {
        schema: LlmObjectSchema<T>
    }

type AiGenerateTextResult = LlmGenerateTextResult & {
    status: typeof AI_METRIC_STATUS.SUCCESS
}

type AiGenerateObjectResult<T extends AiMetricGeneratedResult> =
    LlmGenerateObjectResult<T> & {
        status: typeof AI_METRIC_STATUS.SUCCESS
    }

type GenerationFailure = {
    errorCode: string
    errorMessage: string
}

type RecordMetricInput = {
    userLinkId: number
    taskType: AiTaskType
    target: LlmResolvedTarget
    promptKey?: string
    usage?: LlmUsage
    ttlbMs: number
} & ({ generatedResult: AiMetricGeneratedResult } | GenerationFailure)

type CreateGenerationErrorInput = {
    error: unknown
    taskType: AiTaskType
    failure?: GenerationFailure
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name)

    constructor(
        private readonly llmService: LlmService,
        private readonly aiMetricService: AiMetricService,
    ) {}

    generateSummary(): Promise<never> {
        // TODO: 요약 prompt 조립, text/object 방식 선택, 결과 품질과 반환 정책을 구현한다.
        return Promise.reject(
            new AiUseCaseNotImplementedError('generateSummary'),
        )
    }

    generateTags(): Promise<never> {
        // TODO: 태그 prompt 조립, text/object 방식 선택, parsing과 결과 품질 및 반환 정책을 구현한다.
        return Promise.reject(new AiUseCaseNotImplementedError('generateTags'))
    }

    private async generateText(
        input: AiGenerateTextInput,
    ): Promise<AiGenerateTextResult> {
        const target = this.resolveTarget(input)
        const startedAt = performance.now()

        try {
            const result = await this.llmService.generateTextWithResolvedTarget(
                {
                    system: input.system,
                    prompt: input.prompt,
                    target,
                },
            )
            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                generatedResult: result.text,
                usage: result.usage,
                ttlbMs: result.ttlbMs,
            })

            return {
                ...result,
                status: AI_METRIC_STATUS.SUCCESS,
            }
        } catch (error) {
            const failure = this.toFailure(error)

            if (error instanceof LlmConfigurationError) {
                throw this.createGenerationError({
                    error,
                    taskType: input.taskType,
                    failure,
                })
            }

            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                ...failure,
                ttlbMs: Math.round(performance.now() - startedAt),
            })

            throw this.createGenerationError({
                error,
                taskType: input.taskType,
                failure,
            })
        }
    }

    private async generateObject<T extends AiMetricGeneratedResult>(
        input: AiGenerateObjectInput<T>,
    ): Promise<AiGenerateObjectResult<T>> {
        const target = this.resolveTarget(input)
        const startedAt = performance.now()

        try {
            const result =
                await this.llmService.generateObjectWithResolvedTarget({
                    system: input.system,
                    prompt: input.prompt,
                    target,
                    schema: input.schema,
                    responseSchemaName:
                        AI_TASK_RESPONSE_SCHEMA_NAME[input.taskType],
                })
            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                generatedResult: result.data,
                usage: result.usage,
                ttlbMs: result.ttlbMs,
            })

            return {
                ...result,
                status: AI_METRIC_STATUS.SUCCESS,
            }
        } catch (error) {
            const failure = this.toFailure(error)

            if (error instanceof LlmConfigurationError) {
                throw this.createGenerationError({
                    error,
                    taskType: input.taskType,
                    failure,
                })
            }

            await this.recordMetric({
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                target,
                promptKey: input.promptKey,
                ...failure,
                ttlbMs: Math.round(performance.now() - startedAt),
            })

            throw this.createGenerationError({
                error,
                taskType: input.taskType,
                failure,
            })
        }
    }

    private resolveTarget(input: {
        llm?: LlmTargetOptions
        taskType: AiTaskType
    }) {
        try {
            return this.llmService.resolveTarget({ target: input.llm })
        } catch (error) {
            throw this.createGenerationError({
                error,
                taskType: input.taskType,
            })
        }
    }

    private createGenerationError(input: CreateGenerationErrorInput) {
        const failure = input.failure ?? this.toFailure(input.error)

        return new AiGenerationError({
            code: failure.errorCode,
            message: failure.errorMessage,
            taskType: input.taskType,
            cause: input.error,
        })
    }

    private toFailure(error: unknown): GenerationFailure {
        if (error instanceof LlmError) {
            return {
                errorCode: error.code,
                errorMessage: error.message,
            }
        }

        if (error instanceof z.ZodError) {
            return {
                errorCode:
                    AI_FAILURE_ERROR_CODE.GENERATED_RESULT_VALIDATION_FAILED,
                errorMessage: error.message,
            }
        }

        if (error instanceof Error) {
            return {
                errorCode: error.name,
                errorMessage: error.message,
            }
        }

        return {
            errorCode: AI_FAILURE_ERROR_CODE.UNKNOWN_ERROR,
            errorMessage: String(error),
        }
    }

    private async recordMetric(input: RecordMetricInput) {
        try {
            const baseMetric = {
                userLinkId: input.userLinkId,
                taskType: input.taskType,
                modelProvider: input.target.provider,
                modelName: input.target.model,
                promptKey: input.promptKey,
                inputTokens: input.usage?.inputTokens,
                outputTokens: input.usage?.outputTokens,
                ttlbMs: input.ttlbMs,
            }

            if ('errorCode' in input) {
                return await this.aiMetricService.record({
                    ...baseMetric,
                    status: AI_METRIC_STATUS.FAILED,
                    errorCode: input.errorCode,
                    errorMessage: input.errorMessage,
                })
            }

            return await this.aiMetricService.record({
                ...baseMetric,
                status: AI_METRIC_STATUS.SUCCESS,
                generatedResult: input.generatedResult,
            })
        } catch (error) {
            this.logMetricError(
                `AI 메트릭 기록에 실패했습니다. userLinkId=${input.userLinkId}, taskType=${input.taskType}`,
                error,
            )

            return undefined
        }
    }

    private logMetricError(message: string, error: unknown) {
        const errorType = error instanceof Error ? error.name : typeof error

        this.logger.error(`${message}, errorType=${errorType}`)
    }
}
