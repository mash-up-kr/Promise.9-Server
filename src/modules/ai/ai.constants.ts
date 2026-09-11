export const AI_TASK_TYPE = {
    LINK_ANALYSIS_GENERATE: 'LINK_ANALYSIS_GENERATE',
} as const

export type AiTaskType = (typeof AI_TASK_TYPE)[keyof typeof AI_TASK_TYPE]

// 임베딩은 생성 metrics를 기록하지 않으므로 AiTaskType에 포함하지 않고,
// AiGenerationError의 실패 context로만 사용한다.
export const AI_EMBEDDING_TASK_TYPE = 'EMBEDDING_GENERATE' as const
export type AiErrorTaskType = AiTaskType | typeof AI_EMBEDDING_TASK_TYPE

export const AI_TASK_RESPONSE_SCHEMA_NAME = {
    [AI_TASK_TYPE.LINK_ANALYSIS_GENERATE]: 'link_analysis_result',
} as const satisfies Record<AiTaskType, string>

export const AI_METRIC_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
} as const

export type AiMetricStatus =
    (typeof AI_METRIC_STATUS)[keyof typeof AI_METRIC_STATUS]

export const AI_FAILURE_ERROR_CODE = {
    GENERATED_RESULT_VALIDATION_FAILED: 'AI_GENERATED_RESULT_VALIDATION_FAILED',
    GENERATED_TEXT_NOT_KOREAN: 'AI_GENERATED_TEXT_NOT_KOREAN',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export const AI_LINK_ANALYSIS = {
    // 프롬프트가 요구하는 요약 길이. OpenAI strict 모드는 스키마 maxLength에 닿으면 문장을 강제로 끊으므로
    // 검증 상한(summaryMaxLength)은 목표 길이보다 넉넉히 둬 완결된 문장이 저장되게 한다.
    summaryTargetLength: 300,
    summaryMaxLength: 500,
    tagMaxCount: 5,
    tagMaxLength: 20,
    reviewReasonMaxLength: 200,
} as const
