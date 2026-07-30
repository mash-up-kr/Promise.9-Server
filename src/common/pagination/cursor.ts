// 커서 인코딩/디코딩과 페이지 봉투 계산 같은 DB 비의존 로직만 공통에 둔다.
// 정렬 컬럼·drizzle 조건(buildCursorCondition/buildCursorOrderBy) 등 DB 세부는
// 이를 쓰는 각 모듈의 repository가 담당한다.

// 커서 페이로드: 정렬 기준 컬럼 값(v)과 안정 정렬용 tiebreaker(id).
// 타임스탬프 정렬 값은 ISO 문자열로, null 정렬 값은 null로 인코딩한다.
export interface CursorPayload {
    v: string | null
    id: number
}

export interface CursorPage<T> {
    rows: T[]
    pagination: {
        nextCursor: string | null
        hasNext: boolean
        limit: number
    }
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
