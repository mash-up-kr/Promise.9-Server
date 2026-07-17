import {
    LlmGenerateObjectResult,
    LlmGenerateTextResult,
    LlmObjectSchema,
    LlmResolvedTarget,
    LlmTargetOptions,
    LlmUsage,
} from '../../infrastructure/llm/llm.type'

import { AiMetricGeneratedResult } from './metrics/ai-metric.type'
import { AI_METRIC_STATUS, AiTaskType } from './ai.constants'

/** AiService의 private text 생성 실행기에 전달하는 AI 작업 입력. */
export type AiGenerateTextInput = {
    userLinkId: number
    taskType: AiTaskType
    promptKey?: string
    llm?: LlmTargetOptions
    system?: string
    prompt: string
}

/** AiService의 private object 생성 실행기에 전달하는 schema 포함 입력. */
export type AiGenerateObjectInput<T extends AiMetricGeneratedResult> =
    AiGenerateTextInput & {
        schema: LlmObjectSchema<T>
    }

/** text 생성 결과에 metrics 상태를 더한 반환 타입. */
export type AiGenerateTextResult = LlmGenerateTextResult & {
    status: typeof AI_METRIC_STATUS.SUCCESS
}

/** object 생성 결과에 metrics 상태를 더한 반환 타입. */
export type AiGenerateObjectResult<T extends AiMetricGeneratedResult> =
    LlmGenerateObjectResult<T> & {
        status: typeof AI_METRIC_STATUS.SUCCESS
    }

/** model과 provider target을 확정할 때 필요한 유스케이스 context. */
export type AiResolveTargetInput = Pick<AiGenerateTextInput, 'llm' | 'taskType'>

/** LLM 또는 결과 검증 오류를 metrics에 저장할 공통 실패 정보로 정규화한 타입. */
export type AiGenerationFailure = {
    errorCode: string
    errorMessage: string
}

/** resolved target을 기준으로 성공 결과 또는 실패 정보를 기록하는 metrics 입력. */
export type AiRecordMetricInput = {
    userLinkId: number
    taskType: AiTaskType
    target: LlmResolvedTarget
    promptKey?: string
    usage?: LlmUsage
    ttlbMs: number
} & ({ generatedResult: AiMetricGeneratedResult } | AiGenerationFailure)

/** 내부 오류를 AiGenerationError로 변환할 때 필요한 context. */
export type AiCreateGenerationErrorInput = {
    error: unknown
    taskType: AiTaskType
    failure?: AiGenerationFailure
}
