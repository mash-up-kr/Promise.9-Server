import { beforeEach, describe, expect, it, jest } from 'bun:test'

import type { BunMocked } from '../../../../test/bun-test.type'
import { AiService } from '../../ai/ai.service'
import { LinkEmbeddingSource, LinkRepository } from '../link.repository'

import { EmbeddingService } from './embedding.service'

describe('EmbeddingService', () => {
    let service: EmbeddingService
    let aiService: BunMocked<Pick<AiService, 'embedText'>>
    let linkRepository: BunMocked<
        Pick<LinkRepository, 'findEmbeddingSource' | 'updateEmbedding'>
    >

    const source: LinkEmbeddingSource = {
        id: 11,
        userId: 2,
        title: '링크 제목',
        tagNames: ['NestJS', '백엔드'],
        aiSummary: 'AI가 생성한 요약',
    }

    beforeEach(() => {
        aiService = {
            embedText: jest.fn(),
        }
        linkRepository = {
            findEmbeddingSource: jest.fn(),
            updateEmbedding: jest.fn().mockResolvedValue(true),
        }
        service = new EmbeddingService(
            aiService as unknown as AiService,
            linkRepository as unknown as LinkRepository,
        )
    })

    it('최신 제목·태그·AI 요약을 임베딩해 저장한다', async () => {
        const embedding = [0.1, 0.2, 0.3]
        linkRepository.findEmbeddingSource.mockResolvedValueOnce(source)
        aiService.embedText.mockResolvedValueOnce(embedding)

        await expect(service.embedLink(2, 11)).resolves.toBe(true)

        expect(linkRepository.findEmbeddingSource).toHaveBeenCalledWith(2, 11)
        expect(aiService.embedText).toHaveBeenCalledWith(
            ['링크 제목', 'NestJS', '백엔드', 'AI가 생성한 요약'].join('\n'),
        )
        expect(linkRepository.updateEmbedding).toHaveBeenCalledWith(
            2,
            11,
            embedding,
        )
    })

    it('활성 링크가 없으면 임베딩을 요청하지 않는다', async () => {
        linkRepository.findEmbeddingSource.mockResolvedValueOnce(undefined)

        await expect(service.embedLink(2, 11)).resolves.toBe(false)

        expect(aiService.embedText).not.toHaveBeenCalled()
        expect(linkRepository.updateEmbedding).not.toHaveBeenCalled()
    })

    it('새 원본이 비었으면 기존의 낡은 임베딩을 제거한다', async () => {
        const emptySource: LinkEmbeddingSource = {
            ...source,
            title: null,
            tagNames: [],
            aiSummary: null,
        }
        linkRepository.findEmbeddingSource.mockResolvedValueOnce(emptySource)

        await expect(service.embedLink(2, 11)).resolves.toBe(false)

        expect(aiService.embedText).not.toHaveBeenCalled()
        expect(linkRepository.updateEmbedding).toHaveBeenCalledWith(2, 11, null)
    })

    it('활성 링크에 embedding을 저장하지 못하면 실패를 반환한다', async () => {
        linkRepository.findEmbeddingSource.mockResolvedValueOnce(source)
        aiService.embedText.mockResolvedValueOnce([0.1, 0.2, 0.3])
        linkRepository.updateEmbedding.mockResolvedValueOnce(false)

        await expect(service.embedLink(2, 11)).resolves.toBe(false)
    })
})
