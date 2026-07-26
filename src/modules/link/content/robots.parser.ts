// 현재 UA에 적용되는 robots 규칙 중 가장 구체적인 경로 규칙으로 접근 가능 여부를 판단한다.
export function isRobotsPathAllowed(
    robotsTxt: string,
    path: string,
    userAgent: string,
): boolean {
    const groups = parseRobotsGroups(robotsTxt)
    const applicable = groups.filter((group) =>
        group.agents.some(
            (agent) => agent === '*' || userAgent.toLowerCase().includes(agent),
        ),
    )
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

        if (!line) {
            current = undefined
            continue
        }

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

// robots 경로의 * wildcard를 반영해 요청 경로가 규칙에 매칭되는지 확인한다.
function matchesPath(path: string, rulePath: string): boolean {
    const escaped = rulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}`).test(path)
}
