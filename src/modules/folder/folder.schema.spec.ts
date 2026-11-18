import { getTableColumns } from 'drizzle-orm'

import { folders } from './folder.schema'

describe('folders 스키마', () => {
    it('공유 토큰과 공유 시작 시각 열은 비어 있을 수 있다', () => {
        const columns = getTableColumns(folders)

        expect(columns.shareToken.notNull).toBe(false)
        expect(columns.sharedAt.notNull).toBe(false)
    })
})
