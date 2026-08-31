import { Injectable } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { LinkRepository } from '../link.repository'
import { buildEmbeddingText } from '../link.util'

// 링크 임베딩 생성·저장과 검색 쿼리 임베딩을 담당한다.
// 텍스트 조립(link.util)·임베딩(AiService)·저장(LinkRepository)을 조율만 하며,
// provider나 저장 방식의 세부는 각 의존성이 감춘다.
@Injectable()
export class EmbeddingService {
    constructor(
        private readonly aiService: AiService,
        private readonly linkRepository: LinkRepository,
    ) {}

    // 검색 쿼리를 임베딩한다. 실패는 호출부가 폴백을 정하도록 그대로 전파한다.
    async embedQuery(text: string): Promise<number[]> {
        return this.aiService.embedText(text)
    }

    // 최신 활성 링크와 태그를 조회해 임베딩하고, 원본이 비었으면 기존 벡터를 제거한다.
    async embedLink(userId: number, linkId: number): Promise<boolean> {
        const source = await this.linkRepository.findEmbeddingSource(
            userId,
            linkId,
        )

        if (!source) {
            return false
        }

        const text = buildEmbeddingText(source)

        if (!text) {
            await this.linkRepository.updateEmbedding(userId, linkId, null)
            return false
        }

        const embedding = await this.aiService.embedText(text)
        return this.linkRepository.updateEmbedding(userId, linkId, embedding)
    }
}
