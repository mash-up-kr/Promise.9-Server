import type { LlmModelName } from '../../common/constants/llm'
import { LLM_MODEL } from '../../common/constants/llm'

export const LLM_PROVIDER = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
} as const

export type LlmProviderName = (typeof LLM_PROVIDER)[keyof typeof LLM_PROVIDER]

export const LLM_MODEL_PROVIDER = {
    [LLM_MODEL.GPT_5_5]: LLM_PROVIDER.OPENAI,
    [LLM_MODEL.GPT_5_4_MINI]: LLM_PROVIDER.OPENAI,
    [LLM_MODEL.GPT_5_4_NANO]: LLM_PROVIDER.OPENAI,
    [LLM_MODEL.GEMINI_2_5_FLASH]: LLM_PROVIDER.GEMINI,
    [LLM_MODEL.GEMINI_2_5_FLASH_LITE]: LLM_PROVIDER.GEMINI,
    [LLM_MODEL.GEMINI_3_5_FLASH]: LLM_PROVIDER.GEMINI,
    [LLM_MODEL.GEMINI_3_1_FLASH_LITE]: LLM_PROVIDER.GEMINI,
} as const satisfies Record<LlmModelName, LlmProviderName>

export const LLM_DEFAULT_RESPONSE_SCHEMA_NAME = 'llm_result'
