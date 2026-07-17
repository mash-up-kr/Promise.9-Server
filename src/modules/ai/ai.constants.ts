export const AI_TASK_TYPE = {
    SUMMARY_GENERATE: 'SUMMARY_GENERATE',
    TAG_GENERATE: 'TAG_GENERATE',
} as const

export type AiTaskType = (typeof AI_TASK_TYPE)[keyof typeof AI_TASK_TYPE]

export const AI_METRIC_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
} as const

export type AiMetricStatus =
    (typeof AI_METRIC_STATUS)[keyof typeof AI_METRIC_STATUS]
