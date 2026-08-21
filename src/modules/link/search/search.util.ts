import { CursorPayload, decodeCursor } from '../../../common/pagination/cursor'
import { LINK_SEARCH_SCORE_PRECISION } from '../link.constants'

export type ScoredCandidate = { id: number; score: number }

// 검색 결과 커서: 정렬 키인 (점수, id)를 그대로 담는다.
export type SearchCursor = { score: number; id: number }

// 커서 이후 후보만 남겨 limit + 1개를 자른다. (다음 페이지 존재 여부 판단용)
// candidates는 scoreSearchCandidates가 정렬한 (score desc, id desc) 순서여야 한다.
export function takeSearchPage(
    candidates: ScoredCandidate[],
    cursor: SearchCursor | undefined,
    limit: number,
): ScoredCandidate[] {
    const remaining = cursor
        ? candidates.filter(
              (candidate) =>
                  candidate.score < cursor.score ||
                  (candidate.score === cursor.score &&
                      candidate.id < cursor.id),
          )
        : candidates

    return remaining.slice(0, limit + 1)
}

// 응답 점수와 커서 점수에 같은 값을 쓰기 위해 고정 자릿수로 반올림한다.
// 쿼리 임베딩을 매 요청 재생성하면서 생기는 미세한 부동소수 차이가
// 커서 경계를 어긋나게 하는 것을 막는다.
export function roundSearchScore(score: number): number {
    return (
        Math.round(score * LINK_SEARCH_SCORE_PRECISION) /
        LINK_SEARCH_SCORE_PRECISION
    )
}

// 검색 커서를 (점수, id)로 인코딩하기 위한 페이로드를 만든다.
export function toSearchCursorPayload(
    candidate: ScoredCandidate,
): CursorPayload {
    return { v: String(candidate.score), id: candidate.id }
}

// 요청 커서를 검색 정렬 키로 되돌린다. 형식이 어긋나면 null. (호출부가 400 처리)
export function parseSearchCursor(cursor: string): SearchCursor | null {
    const decoded = decodeCursor(cursor)

    if (!decoded || decoded.v === null) {
        return null
    }

    const score = Number(decoded.v)

    if (!Number.isFinite(score)) {
        return null
    }

    return { score, id: decoded.id }
}
