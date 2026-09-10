import { LinkMetadata, LinkRow } from './link.schema'
import {
    buildEmbeddingText,
    mergeImageMetadata,
    pickContentRefreshDueAt,
    pickThumbnailExpiresAt,
    toProcessingStatus,
} from './link.util'

const INSTAGRAM_IMAGE_URL =
    'https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg?ig_cache_key=abc&oe=68d1a000'

describe('buildEmbeddingText', () => {
    const base = {
        title: null,
        aiSummary: null,
        tagNames: [],
    } as Pick<LinkRow, 'title' | 'aiSummary'> & {
        tagNames: string[]
    }

    it('의미 있는 필드를 개행으로 결합한다', () => {
        const text = buildEmbeddingText({
            ...base,
            title: 'NestJS 클린 아키텍처',
            tagNames: ['NestJS', '백엔드'],
            aiSummary: '계층 분리와 의존성 역전 정리',
        })

        expect(text).toBe(
            [
                'NestJS 클린 아키텍처',
                'NestJS',
                '백엔드',
                '계층 분리와 의존성 역전 정리',
            ].join('\n'),
        )
    })

    it('빈 값·공백 필드는 제외한다', () => {
        const text = buildEmbeddingText({
            ...base,
            title: '제목',
            tagNames: ['', '   '],
        })

        expect(text).toBe('제목')
    })

    it('임베딩할 텍스트가 없으면 빈 문자열을 반환한다', () => {
        expect(buildEmbeddingText(base)).toBe('')
    })
})

describe('mergeImageMetadata', () => {
    it('TTL이 있는 이미지는 expiresAt을 함께 저장한다', () => {
        const metadata = mergeImageMetadata(null, {
            url: INSTAGRAM_IMAGE_URL,
            source: 'tinyfish',
        })

        expect(metadata.images?.[0]).toMatchObject({
            url: INSTAGRAM_IMAGE_URL,
            expiresAt: new Date(parseInt('68d1a000', 16) * 1000).toISOString(),
        })
    })

    it('TTL이 없는 이미지는 expiresAt을 저장하지 않는다', () => {
        const metadata = mergeImageMetadata(null, {
            url: 'https://static.toss.tech/thumbnail.png',
            source: 'og:image',
        })

        expect(metadata.images?.[0].expiresAt).toBeUndefined()
    })

    // 갱신마다 서명이 바뀌는 CDN URL이 무한히 쌓이지 않아야 한다.
    it('보관하는 이미지 수를 상한으로 제한한다', () => {
        let metadata: LinkMetadata | null = null

        for (let index = 0; index < 8; index += 1) {
            metadata = mergeImageMetadata(metadata, {
                url: `https://example.com/${index}.png`,
                source: 'og:image',
            })
        }

        expect(metadata?.images).toHaveLength(5)
        expect(metadata?.images?.[0].url).toBe('https://example.com/7.png')
    })
})

describe('pickThumbnailExpiresAt', () => {
    it('대표 이미지의 expiresAt을 Date로 반환한다', () => {
        const isoExpiresAt = '2026-09-15T00:00:00.000Z'
        const metadata: LinkMetadata = {
            version: 1,
            images: [
                { url: 'https://example.com/a.png', expiresAt: isoExpiresAt },
            ],
        }

        expect(pickThumbnailExpiresAt(metadata)).toEqual(new Date(isoExpiresAt))
    })

    it('expiresAt이 없으면 null을 반환한다', () => {
        expect(pickThumbnailExpiresAt(null)).toBeNull()
    })
})

describe('pickContentRefreshDueAt', () => {
    const now = new Date('2026-09-10T00:00:00.000Z')

    it('YouTube 링크는 30일 뒤를 갱신 기한으로 잡는다', () => {
        const dueAt = pickContentRefreshDueAt(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            null,
            now,
        )

        expect(dueAt).toEqual(new Date('2026-10-10T00:00:00.000Z'))
    })

    it('TTL 있는 썸네일과 YouTube 정책이 겹치면 더 이른 시각을 쓴다', () => {
        const metadata: LinkMetadata = {
            version: 1,
            images: [
                {
                    url: 'https://example.com/a.png',
                    expiresAt: '2026-09-15T00:00:00.000Z',
                },
            ],
        }

        const dueAt = pickContentRefreshDueAt(
            'https://youtu.be/dQw4w9WgXcQ',
            metadata,
            now,
        )

        expect(dueAt).toEqual(new Date('2026-09-15T00:00:00.000Z'))
    })

    it('YouTube가 아니고 TTL도 없으면 null을 반환한다', () => {
        expect(
            pickContentRefreshDueAt(
                'https://toss.tech/article/slug',
                null,
                now,
            ),
        ).toBeNull()
    })

    // 과거 기한을 그대로 저장하면 스케줄러가 매 실행마다 같은 링크를 다시 집는다.
    it('이미 만료된 썸네일뿐이면 쿨다운 뒤로 기한을 미룬다', () => {
        const metadata: LinkMetadata = {
            version: 1,
            images: [
                {
                    url: 'https://example.com/a.png',
                    source: 'og:image',
                    expiresAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        }

        const dueAt = pickContentRefreshDueAt(
            'https://example.com/post',
            metadata,
            now,
        )

        expect(dueAt).toEqual(new Date('2026-09-12T00:00:00.000Z'))
    })

    it('잘못된 URL이면 YouTube 정책은 적용하지 않는다', () => {
        expect(pickContentRefreshDueAt('not a url', null, now)).toBeNull()
    })
})

describe('toProcessingStatus', () => {
    it('개발자 검토 상태는 클라이언트에 SUCCESS로 내려준다', () => {
        expect(toProcessingStatus('NEEDS_REVIEW')).toBe('SUCCESS')
    })

    it.each(['PENDING', 'SUCCESS', 'FAILED'])(
        '%s 상태는 그대로 반환한다',
        (status) => {
            expect(toProcessingStatus(status)).toBe(status)
        },
    )
})
