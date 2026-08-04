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

// 임베딩 전용 모델. 텍스트 생성 모델(LLM_MODEL)과 목적·차원이 달라 분리한다.
// 임베딩은 provider 간 벡터가 호환되지 않아(교체하면 전량 재생성) 추상화 없이 OpenAI로 고정한다.
// 3-small은 한국어 의미 검색 품질이 낮아 3-large를 쓴다(768차원에서도 한국어 분리 양호).
export const EMBEDDING_MODEL = {
    OPENAI_3_LARGE: 'text-embedding-3-large',
} as const

// 임베딩 벡터 차원. DB의 vector(N) 컬럼 정의와 반드시 일치해야 한다.
// text-embedding-3-large는 dimensions 축소를 네이티브 지원하며, 축소 결과도 정규화되어 온다.
export const EMBEDDING_DIMENSIONS = 768
