import { Module } from '@nestjs/common'

import { GeminiProvider } from './providers/gemini/gemini.provider'
import { OpenAiProvider } from './providers/openai/openai.provider'
import { LlmService } from './llm.service'

@Module({
    providers: [GeminiProvider, OpenAiProvider, LlmService],
    exports: [LlmService],
})
export class LlmModule {}
