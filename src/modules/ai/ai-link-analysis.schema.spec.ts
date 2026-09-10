import { AI_LINK_ANALYSIS } from './ai.constants'
import { aiLinkAnalysisResultSchema } from './ai-link-analysis.schema'

// 요약 검증 상한은 프롬프트 목표 길이보다 넉넉해야 provider가 문장을 강제로 끊지 않는다.
describe('aiLinkAnalysisResultSchema', () => {
    const base = { tags: ['개발'], needsReview: false, reviewReason: null }

    it('요약 검증 상한은 프롬프트 목표 길이보다 크다', () => {
        expect(AI_LINK_ANALYSIS.summaryMaxLength).toBeGreaterThan(
            AI_LINK_ANALYSIS.summaryTargetLength,
        )
    })

    it('목표 길이를 넘어도 상한 이내면 요약을 통과시킨다', () => {
        const summary = '가'.repeat(AI_LINK_ANALYSIS.summaryMaxLength)

        expect(
            aiLinkAnalysisResultSchema.safeParse({ ...base, summary }).success,
        ).toBe(true)
    })

    it('상한을 넘는 요약은 검증에 실패한다', () => {
        const summary = '가'.repeat(AI_LINK_ANALYSIS.summaryMaxLength + 1)

        expect(
            aiLinkAnalysisResultSchema.safeParse({ ...base, summary }).success,
        ).toBe(false)
    })
})
