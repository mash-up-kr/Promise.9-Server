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
        '본문 경계가 없어도 메타 설명과 이미지를 보존한다: %s',
        (content) => {
            expect(
                normalizeXPostContent({
                    ...response('본문'),
                    content,
                    imageLinks: ['https://pbs.twimg.com/media/own.jpg'],
                }),
            ).toMatchObject({
                title: '본문',
                content: '본문',
                imageLinks: ['https://pbs.twimg.com/media/own.jpg'],
            })
        },
    )
    it('메타 설명과 본문이 다르면 메타 설명으로 대체한다', () => {
        expect(
            normalizeXPostContent({
                ...response('부모글'),
                description: '요청한 답글',
            }).content,
        ).toBe('요청한 답글')
    })
    it('알 수 없는 언어의 시각이라도 이미지는 보존하고 UI는 본문으로 쓰지 않는다', () => {
        expect(
            normalizeXPostContent({
                ...response(''),
                description: null,
                content: 'NASA\n@NASA\nBild\n15:32 Uhr, 3. April 2026\n12',
                imageLinks: ['https://pbs.twimg.com/media/own.jpg'],
            }),
        ).toMatchObject({
            title: null,
            content: null,
            imageLinks: ['https://pbs.twimg.com/media/own.jpg'],
        })
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

it.each([false, true])(
    '본문의 일정 문자열을 보존한다 (반복 article: %s)',
    (repeat) => {
        const body =
            '일정 안내 '.repeat(20) +
            '\n1:32 PM · Apr 3, 2026\n장소와 준비물 안내를 끝까지 보존합니다.'
        const r = response(body)
        expect(
            normalizeXPostContent({
                ...r,
                description: body.slice(0, 85) + '…',
                content: repeat ? r.content + '\n\n' + r.content : r.content,
            }).content,
        ).toBe(body)
    },
)

it('한글 일정이 여러 개 있어도 실제 마지막 게시 시각 앞까지 보존한다', () => {
    const body =
        '일정\n오후 3:27 · 2026년 4월 7일\n다음 일정\n오전 9:00 · 2026년 4월 8일\n마지막 안내'
    expect(normalizeXPostContent(response(body)).content).toBe(body)
})

it('실제 시각이 낯선 형식이면 본문 일정을 footer로 선택하지 않고 설명으로 대체한다', () => {
    const description =
        '일정 안내 '.repeat(20) +
        '\n1:32 PM · Apr 3, 2026\n준비물을 지참해주세요.'
    expect(
        normalizeXPostContent({
            ...response(description),
            content: `NASA\n@NASA\n${description}\n15:32 Uhr, 3. April 2026\n12`,
        }).content,
    ).toBe(description)
})
