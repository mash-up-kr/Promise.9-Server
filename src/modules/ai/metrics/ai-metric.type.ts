export type AiMetricGeneratedResult =
    | null
    | string
    | number
    | boolean
    | AiMetricGeneratedResult[]
    | { [key: string]: AiMetricGeneratedResult }
