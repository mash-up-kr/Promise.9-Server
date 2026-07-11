import { AI_METRIC_STATUS, AiTaskType } from '../ai.constants'

/** ai_metrics.generated_result에 저장할 수 있는 JSON 값. */
export type AiMetricGeneratedResult =
    | null
    | string
    | number
    | boolean
    | AiMetricGeneratedResult[]
    | { [key: string]: AiMetricGeneratedResult }

type AiMetricRecordBaseInput = {
    userLinkId: number
    taskType: AiTaskType
    modelProvider: string
    modelName: string
    promptKey?: string
    inputTokens?: number
    outputTokens?: number
    ttlbMs: number
}

/** 성공 결과 또는 실패 정보를 ai_metrics에 기록하기 위한 입력. */
export type AiMetricRecordInput = AiMetricRecordBaseInput &
    (
        | {
              status: typeof AI_METRIC_STATUS.SUCCESS
              generatedResult: AiMetricGeneratedResult
          }
        | {
              status: typeof AI_METRIC_STATUS.FAILED
              errorCode: string
              errorMessage: string
          }
    )
