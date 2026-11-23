import { MAX_BULK_MOVE_LINKS } from '../link.constants'

import {
    createLinkSchema,
    listLinksQuerySchema,
    moveLinksToFolderSchema,
    updateLinkSchema,
} from './link.dto'

describe('listLinksQuerySchema', () => {
    it('전체 링크는 저장 시각 최신순 cursor 페이지네이션 기본값을 적용한다', () => {
        expect(listLinksQuerySchema.parse({})).toMatchObject({
            deleted: false,
            sortBy: 'savedAt',
            order: 'desc',
            limit: 9,
        })
    })

    it('최근 삭제 링크는 삭제 시각 최신순 cursor 페이지네이션 기본값을 적용한다', () => {
        expect(listLinksQuerySchema.parse({ deleted: 'true' })).toMatchObject({
            deleted: true,
            sortBy: 'deletedAt',
            order: 'desc',
            limit: 9,
        })
    })

    it('리마인드 링크를 가까운 시각순으로 조회하는 query를 파싱한다', () => {
        expect(
            listLinksQuerySchema.parse({
                reminder: 'true',
                sortBy: 'reminderAt',
                order: 'asc',
                limit: '9',
            }),
        ).toMatchObject({
            reminder: true,
            sortBy: 'reminderAt',
            order: 'asc',
            limit: 9,
        })
    })

    it.each([
        { q: 'NestJS', reminder: 'true' },
        { q: 'NestJS', sortBy: 'reminderAt' },
    ])('검색과 리마인드 조회 조건의 조합을 거부한다', (query) => {
        expect(listLinksQuerySchema.safeParse(query).success).toBe(false)
    })
})

describe('moveLinksToFolderSchema', () => {
    it('중복 linkId를 입력 순서대로 제거한다', () => {
        expect(
            moveLinksToFolderSchema.parse({
                linkIds: [42, 42, 43, 42],
                folderId: null,
            }),
        ).toEqual({ linkIds: [42, 43], folderId: null })
    })

    it('빈 linkIds를 거부한다', () => {
        expect(
            moveLinksToFolderSchema.safeParse({
                linkIds: [],
                folderId: 7,
            }).success,
        ).toBe(false)
    })

    it('최대 개수를 초과한 요청을 거부한다', () => {
        expect(
            moveLinksToFolderSchema.safeParse({
                linkIds: Array.from(
                    { length: MAX_BULK_MOVE_LINKS + 1 },
                    (_, index) => index + 1,
                ),
                folderId: 7,
            }).success,
        ).toBe(false)
    })

    it('folderId를 생략한 요청을 거부한다', () => {
        expect(
            moveLinksToFolderSchema.safeParse({ linkIds: [42] }).success,
        ).toBe(false)
    })
})

describe('사용자 지정 제목', () => {
    it.each([null, '제목', '가'.repeat(512)])(
        '생성과 수정에서 제목을 허용한다',
        (customTitle) => {
            expect(
                createLinkSchema.parse({
                    url: 'https://example.com',
                    customTitle,
                }).customTitle,
            ).toBe(customTitle)
            expect(updateLinkSchema.parse({ customTitle }).customTitle).toBe(
                customTitle,
            )
        },
    )

    it.each(['', '   ', '가'.repeat(513), 123])(
        '빈 제목과 잘못된 입력을 거부한다',
        (customTitle) => {
            expect(
                createLinkSchema.safeParse({
                    url: 'https://example.com',
                    customTitle,
                }).success,
            ).toBe(false)
            expect(updateLinkSchema.safeParse({ customTitle }).success).toBe(
                false,
            )
        },
    )

    it('앞뒤 공백을 제거하고 생략한 수정 요청은 거부한다', () => {
        expect(updateLinkSchema.parse({ customTitle: '  제목  ' })).toEqual({
            customTitle: '제목',
        })
        expect(updateLinkSchema.safeParse({}).success).toBe(false)
        expect(
            createLinkSchema.parse({ url: 'https://example.com' }).customTitle,
        ).toBeUndefined()
    })
})
