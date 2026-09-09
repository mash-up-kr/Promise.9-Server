import { normalizeXPostContent } from './x-post-content.parser'

const wrap = (body: string) =>
    `NASA\n\n@NASA\n\n${body}\n\n1:32 PM · Apr 3, 202677MViews\n\n12\n34`
const response = (body: string) => ({
    title: 'NASA (@NASA) on X',
    description: body,
    content: wrap(body),
    imageLinks: [],
})

describe('normalizeXPostContent', () => {
    it('계정명 대신 본문 제목을 생성하고 중복 article·반응 수를 제거한다', () => {
        const r = response('본문 첫 줄\n두 번째 줄')
        const n = normalizeXPostContent({
            ...r,
            content: r.content + '\n\n' + r.content,
        })
        expect(n.title).toBe('본문 첫 줄')
        expect(n.content).toBe('본문 첫 줄\n두 번째 줄')
    })
    it('메타 설명이 잘려도 article의 전체 본문을 보존한다', () => {
        const body = '긴 게시물 '.repeat(100)
        expect(
            normalizeXPostContent({
                ...response(body),
                description: body.slice(0, 150) + '…',
            }).content,
        ).toBe(body.trim())
    })
    it('이모지를 자르지 않고 제목 100자를 제한한다', () => {
        expect(normalizeXPostContent(response('🌎'.repeat(110))).title).toBe(
            '🌎'.repeat(100),
        )
    })
    it('한국어 시각도 본문에 포함하지 않는다', () => {
        expect(
            normalizeXPostContent({
                ...response('한국어 본문'),
                content:
                    'NASA\n@NASA\n한국어 본문\n오후 3:27 · 2026년 4월 7일\n12',
            }).content,
        ).toBe('한국어 본문')
    })
    it.each(['loading', 'NASA\n@NASA\n본문만 있음'])(
        '경계를 확인할 수 없으면 재시도 가능한 오류를 반환한다: %s',
        (content) => {
            try {
                normalizeXPostContent({ ...response('본문'), content })
                throw new Error('expected failure')
            } catch (e) {
                expect(e).toMatchObject({ retryable: true })
            }
        },
    )
    it('메타 설명과 다른 부모 본문은 저장하지 않는다', () => {
        expect(() =>
            normalizeXPostContent({
                ...response('부모글'),
                description: '요청한 답글',
            }),
        ).toThrow('일치하지')
    })
})

it('메타 설명과 본문의 빈 줄 차이는 허용한다', () => {
    const n = normalizeXPostContent({
        ...response('첫 줄\n두 번째 줄'),
        description: '첫 줄\n\n두 번째 줄',
    })
    expect(n.content).toBe('첫 줄\n두 번째 줄')
})

describe('영상 플레이어 표시 정리', () => {
    it('수집한 포스터에 붙은 재생 시간만 제거한다', () => {
        const result = normalizeXPostContent({
            title: 'NASA',
            description: '영상 소개',
            content:
                'NASA\n@NASA\n영상 소개\n![](https://pbs.twimg.com/media/poster)\n00:00\n1:32 PM · Apr 3, 2026',
            imageLinks: ['https://pbs.twimg.com/media/poster'],
        })
        expect(result.content).toBe('영상 소개')
    })
    it('작성자가 본문에 쓴 시간과 링크는 보존한다', () => {
        const result = normalizeXPostContent({
            title: 'NASA',
            description: '방송 시작',
            content: 'NASA\n@NASA\n방송 시작\n00:00\n1:32 PM · Apr 3, 2026',
            imageLinks: [],
        })
        expect(result.content).toBe('방송 시작\n00:00')
    })
})
