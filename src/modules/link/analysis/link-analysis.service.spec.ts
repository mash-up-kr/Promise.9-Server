import { ServiceUnavailableException } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { ImageColorService } from '../../image-color/image-color.service'

import { LinkAnalysisService } from './link-analysis.service'
import { AnalysisInput } from './link-analysis.type'

const input: AnalysisInput = {
    jobType: 'ANALYZE',
    link: {
        id: 1,
        originalUrl: 'https://example.com',
        title: null,
        metadata: null,
        aiSummary: null,
    },
    tags: [],
}
const signal = () => new AbortController().signal
function setup() {
    const collector = {
        collect: jest.fn().mockResolvedValue({
            title: '제목',
            description: '설명',
            content: '본문',
            image: null,
        }),
    }
    const ai = {
        generateSummary: jest.fn().mockResolvedValue({ summary: '요약' }),
        generateTags: jest.fn().mockResolvedValue({ tags: ['AI'] }),
        embedText: jest.fn().mockResolvedValue([1, 0]),
    }
    const image = {
        extractFromUrl: jest.fn().mockRejectedValue(new Error('image failure')),
    }
    return {
        collector,
        ai,
        image,
        service: new LinkAnalysisService(
            collector,
            ai as unknown as AiService,
            image as unknown as ImageColorService,
        ),
    }
}
describe('LinkAnalysisService', () => {
    it('저장 없이 수집 결과·요약·태그·임베딩을 반환한다', async () => {
        const { service, ai } = setup()
        const result = await service.execute(input, signal())
        expect(result.failure).toBeUndefined()
        expect(result.patch).toMatchObject({
            title: '제목',
            aiSummary: '요약',
            aiSummaryStatus: 'SUCCESS',
            embedding: [1, 0],
        })
        expect(ai.embedText).toHaveBeenCalledWith('제목\nAI\n요약')
    })
    it('임베딩 단독 요청은 수집과 요약을 호출하지 않는다', async () => {
        const { service, collector, ai } = setup()
        await service.execute(
            {
                ...input,
                jobType: 'EMBEDDING',
                link: { ...input.link, title: '기존 제목' },
            },
            signal(),
        )
        expect(collector.collect).not.toHaveBeenCalled()
        expect(ai.generateSummary).not.toHaveBeenCalled()
        expect(ai.embedText).toHaveBeenCalledWith('기존 제목')
    })
    it('수집 불가 결과에서는 AI를 호출하지 않는다', async () => {
        const { service, collector, ai } = setup()
        collector.collect.mockResolvedValue({
            analysisUnavailableReason: 'blocked',
        })
        const result = await service.execute(input, signal())
        expect(result.failure).toMatchObject({
            retryable: false,
            code: 'CONTENT_UNAVAILABLE',
        })
        expect(ai.generateSummary).not.toHaveBeenCalled()
    })
    it('요약 실패 시 태그 결과는 보존하되 임베딩을 호출하지 않는다', async () => {
        const { service, ai } = setup()
        ai.generateSummary.mockRejectedValue(new ServiceUnavailableException())
        const result = await service.execute(input, signal())
        expect(result.failure?.retryable).toBe(true)
        expect(result.patch.aiSummaryStatus).toBe('FAILED')
        expect(result.aiTags).toHaveLength(1)
        expect(ai.embedText).not.toHaveBeenCalled()
    })
    it('임베딩 실패가 요약 성공 상태를 덮어쓰지 않는다', async () => {
        const { service, ai } = setup()
        ai.embedText.mockRejectedValue(new Error('provider failed'))
        const result = await service.execute(input, signal())
        expect(result.patch.aiSummaryStatus).toBe('SUCCESS')
        expect(result.failure?.code).toBe('EMBEDDING_FAILED')
    })
    it('사용자 태그와 충돌한 AI 태그를 임베딩에서도 제외한다', async () => {
        const { service, ai } = setup()
        ai.generateTags.mockResolvedValue({ tags: ['ai', 'AI', '다음'] })
        await service.execute(
            {
                ...input,
                tags: [
                    {
                        name: '사용자 AI',
                        normalizedName: 'ai',
                        sourceType: 'user',
                        sortOrder: 0,
                    },
                ],
            },
            signal(),
        )
        expect(ai.embedText).toHaveBeenCalledWith('제목\n사용자 AI\n다음\n요약')
    })
    it('색상 실패에도 이미지와 나머지 결과를 반환한다', async () => {
        const { service, collector } = setup()
        collector.collect.mockResolvedValue({
            title: '제목',
            content: '본문',
            image: { url: 'https://example.com/a.jpg', source: 'og:image' },
        })
        const result = await service.execute(input, signal())
        expect(result.failure).toBeUndefined()
        expect(result.patch.metadata?.images?.[0].url).toBe(
            'https://example.com/a.jpg',
        )
    })
    it('timeout으로 중단한 실행은 후속 AI 호출을 시작하지 않는다', async () => {
        const { service, collector, ai } = setup()
        const controller = new AbortController()
        collector.collect.mockImplementation(() => {
            controller.abort()
            return Promise.resolve(null)
        })
        await service.execute(input, controller.signal)
        expect(ai.generateSummary).not.toHaveBeenCalled()
    })
})
