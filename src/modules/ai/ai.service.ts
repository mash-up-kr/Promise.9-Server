import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'

import {
    LlmConfigurationError,
    LlmError,
    LlmProviderError,
} from '../../infrastructure/llm/llm.exception'
import { LlmService } from '../../infrastructure/llm/llm.service'

import { AiMetricService } from './metrics/ai-metric.service'
import { AiMetricGeneratedResult } from './metrics/ai-metric.type'
import {
    AI_EMBEDDING_TASK_TYPE,
    AI_FAILURE_ERROR_CODE,
    AI_METRIC_STATUS,
    AI_TASK_RESPONSE_SCHEMA_NAME,
    AI_TASK_TYPE,
} from './ai.constants'
import { AiGenerationError } from './ai.exception'
import {
    AiCreateGenerationErrorInput,
    AiGenerateObjectInput,
    AiGenerateObjectResult,
    AiGenerateTextInput,
    AiGenerateTextResult,
    AiGenerationFailure,
    AiLinkAnalysisInput,
    AiLinkAnalysisResult,
    AiRecordMetricInput,
    AiResolveTargetInput,
} from './ai.type'
import { checkKoreanText } from './ai-link-analysis.language'
import { AI_LINK_ANALYSIS_PROMPT } from './ai-link-analysis.prompt'
import { aiLinkAnalysisResultSchema } from './ai-link-analysis.schema'

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name)

    constructor(
        private readonly llmService: LlmService,
        private readonly aiMetricService: AiMetricService,
    ) {}

    // 텍스트 한 건을 임베딩 벡터로 변환한다. 검색 쿼리·단건 임베딩에 사용.
    async embedText(text: string): Promise<number[]> {
        const [embedding] = await this.embedTexts([text])

        return embedding
    }

    // 여러 텍스트를 한 번에 임베딩한다. 링크 백필처럼 배치 처리에 사용.
    async embedTexts(texts: string[]): Promise<number[][]> {
        try {
            const { embeddings } = await this.llmService.embed(texts)

            return embeddings
        } catch (error) {
            throw this.createGenerationError({
                error,
                taskType: AI_EMBEDDING_TASK_TYPE,
            })
        }
    }

    // 수집한 링크 정보로 300자 내외 요약, 최대 5개 태그, 개발자 검토 필요 여부를 한 번에 생성한다.
    async generateLinkAnalysis(
        input: AiLinkAnalysisInput,
    ): Promise<AiLinkAnalysisResult> {
        const prompt = AI_LINK_ANALYSIS_PROMPT.current
        const result = await this.generateObject({
            userLinkId: input.userLinkId,
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            promptKey: prompt.promptKey,
            llm: input.llm,
            system: prompt.system,
            prompt: prompt.buildPrompt(input),
            schema: aiLinkAnalysisResultSchema,
        })
        const { needsReview, reviewReason } = result.data
        // 사용자에게 보이는 요약과 태그는 한국어로만 저장한다. 깨진 자모나 다른 문자 체계가
        // 섞이면 재시도 가능한 실패로 던져 분석 재시도에서 다시 생성한다.
        const summary = this.ensureKoreanText(
            input.userLinkId,
            'summary',
            result.data.summary,
        )
        const tags = result.data.tags.map((tag) =>
            this.ensureKoreanText(input.userLinkId, 'tag', tag),
        )

        // 검토 대상이 아니면 모델이 남긴 사유를 버려 needsReview와 reviewReason이 항상 함께 움직이게 한다.
        return {
            summary: summary.trim(),
            tags,
            needsReview,
            reviewReason: needsReview ? reviewReason?.trim() || null : null,
        }
    }

    private ensureKoreanText(
        userLinkId: number,
        field: 'summary' | 'tag',
        raw: string,
    ): string {
        const checked = checkKoreanText(raw)
        if (checked.ok) return checked.text

        const message = `AI ${field}에 한국어가 아닌 문자가 섞였습니다. issue=${checked.issue}, sample=${checked.sample}`
        this.logger.warn(`${message}, userLinkId=${userLinkId}`)

        throw new AiGenerationError({
            code: AI_FAILURE_ERROR_CODE.GENERATED_TEXT_NOT_KOREAN,
            message,
            taskType: AI_TASK_TYPE.LINK_ANALYSIS_GENERATE,
            retryable: true,
        })
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

    private resolveTarget(input: AiResolveTargetInput) {
        try {
            return this.llmService.resolveTarget({ target: input.llm })
        } catch (error) {
            throw this.createGenerationError({
                error,
                taskType: input.taskType,
            })
        }
    }

    private createGenerationError(input: AiCreateGenerationErrorInput) {
        const failure = input.failure ?? this.toFailure(input.error)

        return new AiGenerationError({
            code: failure.errorCode,
            message: failure.errorMessage,
            taskType: input.taskType,
            retryable: this.isRetryable(input.error),
            cause: input.error,
        })
    }

    // provider 응답을 재시도 가능 여부로 해석해 호출부가 provider 예외를 몰라도 되게 한다.
    // 429를 제외한 4xx와 설정 오류는 다시 호출해도 결과가 같다.
    // status를 알 수 없는 실패(네트워크 오류·타임아웃)와 5xx는 재시도 대상으로 본다.
    private isRetryable(error: unknown): boolean {
        if (error instanceof LlmConfigurationError) {
            return false
        }

        if (
            error instanceof LlmProviderError &&
            error.statusCode !== undefined
        ) {
            const isClientError =
                error.statusCode >= 400 && error.statusCode < 500

            return !isClientError || error.statusCode === 429
        }

        return true
    }

    private toFailure(error: unknown): AiGenerationFailure {
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

    private async recordMetric(input: AiRecordMetricInput) {
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
