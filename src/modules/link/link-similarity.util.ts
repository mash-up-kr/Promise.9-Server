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

    return text.toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? []
}
