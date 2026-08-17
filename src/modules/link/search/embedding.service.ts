import { Injectable } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { LinkRepository } from '../link.repository'
import { LinkRow } from '../link.schema'
import { buildEmbeddingText } from '../link.util'

// 링크 임베딩 생성·저장과 검색 쿼리 임베딩을 담당한다. 벡터를 소비하는 건 검색뿐이라
// search/ 아래에 둔다. 링크 임베딩 트리거는 analysis/의 EMBEDDING 작업 한 곳으로 모여 있고,
// 실패 처리·재시도는 그쪽이 담당하므로 여기서는 예외를 그대로 전파한다.
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

    // 링크 텍스트를 임베딩해 저장한다. 임베딩할 텍스트가 없으면 건너뛴다.
    async embedLink(link: LinkRow): Promise<void> {
        const text = buildEmbeddingText(link)

        if (!text) {
            return
        }

        const embedding = await this.aiService.embedText(text)
        // 생성 중 링크가 수정됐다면 오래된 텍스트의 임베딩을 저장하지 않는다.
        await this.linkRepository.updateEmbedding(link, embedding)
    }
}
