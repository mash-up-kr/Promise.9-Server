import { AiService } from '../../ai/ai.service'
import { LinkEmbeddingSource, LinkRepository } from '../link.repository'

import { EmbeddingService } from './embedding.service'

describe('EmbeddingService', () => {
    let service: EmbeddingService
    let aiService: jest.Mocked<Pick<AiService, 'embedText'>>
    let linkRepository: jest.Mocked<
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
            source,
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
        expect(linkRepository.updateEmbedding).toHaveBeenCalledWith(
            2,
            11,
            null,
            emptySource,
        )
    })

    it('활성 링크에 embedding을 저장하지 못하면 실패를 반환한다', async () => {
        linkRepository.findEmbeddingSource.mockResolvedValueOnce(source)
        aiService.embedText.mockResolvedValueOnce([0.1, 0.2, 0.3])
        linkRepository.updateEmbedding.mockResolvedValueOnce(false)

        await expect(service.embedLink(2, 11)).resolves.toBe(false)
    })

    it.each(['바꾼 제목', '수집 제목'])(
        '이전 임베딩이 늦게 끝나도 제목 변경·해제 후 벡터를 덮어쓰지 않는다: %s',
        async (title) => {
            let current = { ...source }
            let stored: number[] | null = null
            let finishFirst!: (value: number[]) => void
            const repository = {
                findEmbeddingSource: jest.fn(() =>
                    Promise.resolve({ ...current }),
                ),
                updateEmbedding: jest.fn(
                    (
                        _userId: number,
                        _linkId: number,
                        embedding: number[] | null,
                        expected?: LinkEmbeddingSource,
                    ) => {
                        if (expected && expected.title !== current.title) {
                            return Promise.reject(
                                new Error('임베딩 원본이 변경되었습니다.'),
                            )
                        }
                        stored = embedding
                        return Promise.resolve(true)
                    },
                ),
            }
            const service = new EmbeddingService(
                aiService as unknown as AiService,
                repository as unknown as LinkRepository,
            )
            aiService.embedText
                .mockImplementationOnce(
                    () => new Promise((resolve) => (finishFirst = resolve)),
                )
                .mockResolvedValueOnce([2])

            const first = service.embedLink(2, 11)
            await new Promise(setImmediate)
            current = { ...source, title }
            await expect(service.embedLink(2, 11)).resolves.toBe(true)
            const stale = expect(first).rejects.toThrow('원본')
            finishFirst([1])
            await stale

            expect(stored).toEqual([2])
        },
    )
})
