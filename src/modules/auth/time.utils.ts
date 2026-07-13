const MS_PER_UNIT: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
}

// "15m", "30d" 형식의 만료 시간 문자열을 Date로 변환
export function parseExpiresIn(expiresIn: string): Date {
    const unit = expiresIn.slice(-1)
    const value = parseInt(expiresIn.slice(0, -1), 10)

    return new Date(Date.now() + value * (MS_PER_UNIT[unit] ?? 1000))
}
