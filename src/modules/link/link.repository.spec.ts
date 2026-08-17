import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { DatabaseService } from '../../config/database/database.service'

import { LinkRepository } from './link.repository'
import { LinkRow } from './link.schema'

// updateEmbedding이 만든 where 조건을 가로채기 위한 최소 chain mock.
function createRepository() {
    let captured: SQL | undefined
    const chain = {
        set: () => chain,
        where: (condition: SQL) => {
            captured = condition
            return Promise.resolve()
        },
    }
    const databaseService = {
        db: { update: () => chain },
    } as unknown as DatabaseService

    return {
        repository: new LinkRepository(databaseService),
        getCaptured: () => captured,
    }
}

// drizzle dialect로 실제 SQL과 파라미터를 만들어 형태를 검증한다.
function toQuery(condition: SQL | undefined) {
    return new PgDialect().sqlToQuery(condition as SQL)
}

const BASE_SOURCE: Pick<
    LinkRow,
    'id' | 'title' | 'aiSummary' | 'memo' | 'domain' | 'metadata'
> = {
    id: 1,
    title: '제목',
    aiSummary: '요약',
    memo: null,
    domain: 'example.com',
    metadata: null,
}

describe('LinkRepository.updateEmbedding', () => {
    // jsonb 객체를 파라미터로 그대로 넘기면 postgres 드라이버가 직렬화에 실패한다.
    // 임베딩이 metadata 저장 이후에 실행되면서 드러난 버그라 형태를 고정해 둔다.
    it('metadata가 있으면 객체가 아닌 JSON 문자열로 바인딩한다', async () => {
        const { repository, getCaptured } = createRepository()
        const metadata = { version: 1 as const, description: '설명' }

        await repository.updateEmbedding(
            { ...BASE_SOURCE, metadata },
            [0.1, 0.2],
        )

        const { sql, params } = toQuery(getCaptured())

        expect(sql).toContain('::jsonb')
        expect(params).toContain(JSON.stringify(metadata))
        expect(params.some((param) => typeof param === 'object' && param)).toBe(
            false,
        )
    })

    // 'null'::jsonb는 JSON null이라 SQL NULL과 다르므로 is null로 비교해야 한다.
    it('metadata가 null이면 파라미터 없이 is null로 비교한다', async () => {
        const { repository, getCaptured } = createRepository()

        await repository.updateEmbedding(BASE_SOURCE, [0.1, 0.2])

        const { sql, params } = toQuery(getCaptured())

        expect(sql).toContain('"metadata" is null')
        expect(params).not.toContain('null')
    })
})
