export function matchesHostname(url: URL, hostname: string): boolean {
    const normalizedHostname = url.hostname.toLowerCase()

    return (
        normalizedHostname === hostname ||
        normalizedHostname.endsWith(`.${hostname}`)
    )
}

export function withoutSearchParams(url: URL): URL {
    const normalizedUrl = new URL(url)
    normalizedUrl.search = ''
    return normalizedUrl
}
