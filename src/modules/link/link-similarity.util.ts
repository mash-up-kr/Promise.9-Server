// DB의 1 - cosine_distance 결과도 반드시 점수 범위로 제한한다.
export function normalizeCosineSimilarity(
    similarity: number | null | undefined,
): number {
    if (
        similarity === null ||
        similarity === undefined ||
        Number.isNaN(similarity)
    ) {
        return 0
    }

    return Math.min(1, Math.max(0, similarity))
}

export function tokenizeLinkText(text: string | null | undefined): string[] {
    if (!text) {
        return []
    }

    return (
        text
            .normalize('NFKC')
            .toLocaleLowerCase('und')
            .match(/[\p{L}\p{N}]+/gu) ?? []
    )
}

export function jaccardSimilarity<T>(
    left: Iterable<T> | null | undefined,
    right: Iterable<T> | null | undefined,
): number {
    const leftSet = new Set(left ?? [])
    const rightSet = new Set(right ?? [])

    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0
    }

    let intersectionSize = 0
    for (const value of leftSet) {
        if (rightSet.has(value)) {
            intersectionSize += 1
        }
    }

    return intersectionSize / (leftSet.size + rightSet.size - intersectionSize)
}

export function tokenJaccardSimilarity(
    left: string | null | undefined,
    right: string | null | undefined,
): number {
    return jaccardSimilarity(tokenizeLinkText(left), tokenizeLinkText(right))
}

export function tagJaccardSimilarity(
    left: readonly string[] | null | undefined,
    right: readonly string[] | null | undefined,
): number {
    return jaccardSimilarity(normalizeTags(left), normalizeTags(right))
}

function normalizeTags(
    tags: readonly string[] | null | undefined,
): Set<string> {
    return new Set(
        (tags ?? [])
            .map((tag) =>
                tag
                    .normalize('NFKC')
                    .trim()
                    .replace(/\s+/g, ' ')
                    .toLocaleLowerCase('und'),
            )
            .filter(Boolean),
    )
}
