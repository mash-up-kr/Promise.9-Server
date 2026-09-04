export const AI_TASK_TYPE = {
    SUMMARY_GENERATE: 'SUMMARY_GENERATE',
    TAG_GENERATE: 'TAG_GENERATE',
} as const

export type AiTaskType = (typeof AI_TASK_TYPE)[keyof typeof AI_TASK_TYPE]

// 임베딩은 생성 metrics를 기록하지 않으므로 AiTaskType에 포함하지 않고,
// AiGenerationError의 실패 context로만 사용한다.
export const AI_EMBEDDING_TASK_TYPE = 'EMBEDDING_GENERATE' as const
export type AiErrorTaskType = AiTaskType | typeof AI_EMBEDDING_TASK_TYPE

export const AI_TASK_RESPONSE_SCHEMA_NAME = {
    [AI_TASK_TYPE.SUMMARY_GENERATE]: 'summary_result',
    [AI_TASK_TYPE.TAG_GENERATE]: 'tag_result',
} as const satisfies Record<AiTaskType, string>

export const AI_METRIC_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
} as const

export type AiMetricStatus =
    (typeof AI_METRIC_STATUS)[keyof typeof AI_METRIC_STATUS]

export const AI_FAILURE_ERROR_CODE = {
    GENERATED_RESULT_VALIDATION_FAILED: 'AI_GENERATED_RESULT_VALIDATION_FAILED',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export const AI_LINK_ANALYSIS = {
    summaryMaxLength: 300,
    tagMaxCount: 5,
    tagMaxLength: 20,
} as const
