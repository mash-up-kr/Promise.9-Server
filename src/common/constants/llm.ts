export const LLM_MODEL = {
    GPT_5_5: 'gpt-5.5',
    GPT_5_4_MINI: 'gpt-5.4-mini',
    GPT_5_4_NANO: 'gpt-5.4-nano',
    GEMINI_2_5_FLASH: 'gemini-2.5-flash',
    GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
    GEMINI_3_5_FLASH: 'gemini-3.5-flash',
    GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite',
} as const

export type LlmModelName = (typeof LLM_MODEL)[keyof typeof LLM_MODEL]
