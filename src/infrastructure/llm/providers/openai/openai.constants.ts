export const OPENAI_RESPONSE_STATUS = {
    COMPLETED: 'completed',
    FAILED: 'failed',
    IN_PROGRESS: 'in_progress',
    CANCELLED: 'cancelled',
    QUEUED: 'queued',
    INCOMPLETE: 'incomplete',
} as const

export const OPENAI_OUTPUT_CONTENT_TYPE = {
    OUTPUT_TEXT: 'output_text',
    REFUSAL: 'refusal',
} as const

export const OPENAI_RESPONSE_FORMAT_TYPE = {
    JSON_SCHEMA: 'json_schema',
} as const

export const OPENAI_MAX_RETRIES = 1

export const OPENAI_ERROR_CODE = {
    REQUEST_FAILED: 'OPENAI_REQUEST_FAILED',
    RESPONSE_NOT_COMPLETED: 'OPENAI_RESPONSE_NOT_COMPLETED',
    EMPTY_RESPONSE: 'OPENAI_EMPTY_RESPONSE',
    REFUSAL: 'OPENAI_REFUSAL',
} as const
