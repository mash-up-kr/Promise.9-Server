export function matchesHostname(url: URL, hostname: string): boolean {
    const normalizedHostname = url.hostname.toLowerCase()

    return (
        normalizedHostname === hostname ||
        normalizedHostname.endsWith(`.${hostname}`)
    )
}
