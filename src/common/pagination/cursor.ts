import {
    and,
    asc,
    Column,
    desc,
    eq,
    gt,
    isNotNull,
    isNull,
    lt,
    or,
    SQL,
} from 'drizzle-orm'

// 커서 페이로드: 정렬 기준 컬럼 값(v)과 안정 정렬용 tiebreaker(id).
// 타임스탬프 정렬 값은 ISO 문자열로, null 정렬 값은 null로 인코딩한다.
export interface CursorPayload {
    v: string | null
    id: number
}

export function encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

// 복호화에 실패하거나 형식이 어긋나면 null을 반환한다. (호출부가 400 처리)
export function decodeCursor(cursor: string): CursorPayload | null {
    try {
        const parsed: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        )

        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('id' in parsed) ||
            !('v' in parsed)
        ) {
            return null
        }

        const { id, v } = parsed as Record<string, unknown>
        if (
            typeof id !== 'number' ||
            !Number.isInteger(id) ||
            !(typeof v === 'string' || v === null)
        ) {
            return null
        }

        return { id, v }
    } catch {
        return null
    }
}

// 커서 이후 행을 걸러내는 조건을 만든다.
// 정렬은 (sortColumn <dir>, idColumn <dir>)이며 null 위치는 Postgres 기본값
// (DESC → NULLS FIRST, ASC → NULLS LAST)을 그대로 따른다.
export function buildCursorCondition(
    sortColumn: Column,
    idColumn: Column,
    order: 'asc' | 'desc',
    cursor: CursorPayload,
    parseValue: (raw: string) => unknown,
): SQL | undefined {
    const value = cursor.v === null ? null : parseValue(cursor.v)

    if (order === 'desc') {
        // DESC → NULLS FIRST
        if (value === null) {
            // 커서가 null 블록(맨 앞) 안에 있음: 더 뒤의 null 또는 모든 비-null
            return or(
                isNotNull(sortColumn),
                and(isNull(sortColumn), lt(idColumn, cursor.id)),
            )
        }
        return and(
            isNotNull(sortColumn),
            or(
                lt(sortColumn, value),
                and(eq(sortColumn, value), lt(idColumn, cursor.id)),
            ),
        )
    }

    // ASC → NULLS LAST
    if (value === null) {
        return and(isNull(sortColumn), gt(idColumn, cursor.id))
    }
    return or(
        isNull(sortColumn),
        and(
            isNotNull(sortColumn),
            or(
                gt(sortColumn, value),
                and(eq(sortColumn, value), gt(idColumn, cursor.id)),
            ),
        ),
    )
}

// 커서 페이지네이션용 orderBy (정렬 컬럼 + tiebreaker id, 같은 방향).
export function buildCursorOrderBy(
    sortColumn: Column,
    idColumn: Column,
    order: 'asc' | 'desc',
): SQL[] {
    const direction = order === 'desc' ? desc : asc
    return [direction(sortColumn), direction(idColumn)]
}

export interface CursorPage<T> {
    rows: T[]
    pagination: {
        nextCursor: string | null
        hasNext: boolean
        limit: number
    }
}

// limit + 1개를 조회한 결과를 받아 다음 페이지 존재 여부와 nextCursor를 계산한다.
// 마지막 행에서 커서 페이로드를 뽑는 방법(toCursor)은 호출부가 도메인에 맞게 넘긴다.
export function buildCursorPage<T>(
    rows: T[],
    limit: number,
    toCursor: (row: T) => CursorPayload,
): CursorPage<T> {
    const hasNext = rows.length > limit
    const pageRows = hasNext ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)
    const nextCursor =
        hasNext && lastRow ? encodeCursor(toCursor(lastRow)) : null

    return {
        rows: pageRows,
        pagination: { nextCursor, hasNext, limit },
    }
}
