import { MAX_BULK_MOVE_LINKS } from '../link.constants'

import { listLinksQuerySchema, moveLinksToFolderSchema } from './link.dto'

describe('listLinksQuerySchema', () => {
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
