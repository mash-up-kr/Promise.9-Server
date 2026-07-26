// 현재 UA에 적용되는 robots 규칙 중 가장 구체적인 경로 규칙으로 접근 가능 여부를 판단한다.
export function isRobotsPathAllowed(
    robotsTxt: string,
    path: string,
    userAgent: string,
): boolean {
    const groups = parseRobotsGroups(robotsTxt)
    const normalizedUserAgent = userAgent.toLowerCase()
    const matchedGroups = groups.filter((group) =>
        group.agents.some(
            (agent) => agent !== '*' && normalizedUserAgent.includes(agent),
        ),
    )
    const applicable =
        matchedGroups.length > 0
            ? matchedGroups
            : groups.filter((group) => group.agents.includes('*'))
    const rules = applicable.flatMap((group) => group.rules)
    const matches = rules.filter(
        (rule) => rule.path && matchesPath(path, rule.path),
    )

    if (matches.length === 0) return true

    matches.sort((left, right) => {
        const lengthDiff = right.path.length - left.path.length

        if (lengthDiff !== 0) return lengthDiff
        return left.type === 'allow' ? -1 : 1
    })

    return matches[0].type === 'allow'
}

// robots.txt를 user-agent 그룹과 allow/disallow 규칙 목록으로 변환한다.
function parseRobotsGroups(robotsTxt: string) {
    const groups: Array<{
        agents: string[]
        rules: Array<{ type: 'allow' | 'disallow'; path: string }>
    }> = []
    let current: (typeof groups)[number] | undefined

    for (const rawLine of robotsTxt.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*/, '').trim()

        // 빈 줄과 주석 줄은 현재 user-agent 그룹을 끝내지 않는다.
        if (!line) continue

        const separator = line.indexOf(':')

        if (separator === -1) continue

        const field = line.slice(0, separator).trim().toLowerCase()
        const value = line.slice(separator + 1).trim()

        if (field === 'user-agent') {
            if (!current || current.rules.length > 0) {
                current = { agents: [], rules: [] }
                groups.push(current)
            }

            current.agents.push(value.toLowerCase())
            continue
        }

        if (
            (field === 'allow' || field === 'disallow') &&
            current?.agents.length
        ) {
            current.rules.push({ type: field, path: value })
        }
    }

    return groups
}

// robots 경로의 * wildcard와 끝 일치 표식($)을 반영한다.
function matchesPath(path: string, rulePath: string): boolean {
    const endsAtPath = rulePath.endsWith('$')
    const pathPattern = endsAtPath ? rulePath.slice(0, -1) : rulePath
    const escaped = pathPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = escaped.replace(/\\\*/g, '.*')

    return new RegExp(`^${pattern}${endsAtPath ? '$' : ''}`).test(path)
}
