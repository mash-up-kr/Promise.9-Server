import { describe, expect, it } from 'bun:test'

import { BaseException } from '../../common/exception/base.exception'
import { encodeCursor } from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkRepository } from './link.repository'

const listInput = (cursor: string): ListLinksQueryInput => ({
    unassigned: false,
    favorite: false,
    deleted: false,
    sortBy: 'savedAt',
    order: 'desc',
    cursor,
    limit: 9,
})

describe('LinkRepository', () => {
    const repository = new LinkRepository({ db: {} } as DatabaseService)

    it('형식만 맞고 실제로 존재하지 않는 날짜 cursor를 거부한다', async () => {
        const cursor = encodeCursor({
            v: '2026-99-99T99:99:99.999Z',
            id: 1,
        })

        const result = repository.list(1, listInput(cursor))

        await expect(result).rejects.toBeInstanceOf(BaseException)
        await expect(result).rejects.toHaveProperty('status', 400)
    })
})
