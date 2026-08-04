import { LinkRow } from './link.schema'
import { buildEmbeddingText } from './link.util'

describe('buildEmbeddingText', () => {
    const base = {
        title: null,
        aiSummary: null,
        memo: null,
        domain: null,
        metadata: null,
    } as Pick<LinkRow, 'title' | 'aiSummary' | 'memo' | 'domain' | 'metadata'>

    it('의미 있는 필드를 개행으로 결합한다', () => {
        const text = buildEmbeddingText({
            ...base,
            title: 'NestJS 클린 아키텍처',
            aiSummary: '계층 분리와 의존성 역전 정리',
            memo: '나중에 다시 읽기',
            domain: 'toss.tech',
            metadata: { version: 1, description: 'DDD 관점 요약' },
        })

        expect(text).toBe(
            [
                'NestJS 클린 아키텍처',
                '계층 분리와 의존성 역전 정리',
                '나중에 다시 읽기',
                'toss.tech',
                'DDD 관점 요약',
            ].join('\n'),
        )
    })

    it('빈 값·공백 필드는 제외한다', () => {
        const text = buildEmbeddingText({
            ...base,
            title: '제목',
            memo: '   ',
        })

        expect(text).toBe('제목')
    })

    it('임베딩할 텍스트가 없으면 빈 문자열을 반환한다', () => {
        expect(buildEmbeddingText(base)).toBe('')
    })
})
