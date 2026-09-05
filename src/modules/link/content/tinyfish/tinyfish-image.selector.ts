export function findFirstTinyFishImage(
    imageLinks: readonly string[],
    matches: (url: URL) => boolean,
): string | null {
    for (const image of imageLinks) {
        try {
            const url = new URL(image)
            if (matches(url)) return url.toString()
        } catch {
            continue
        }
    }

    return null
}
