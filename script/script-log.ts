export function printTitle(title: string) {
    console.log(`\n${title}`)
}

export function printStep(message: string) {
    console.log(`\n🔎 ${message}`)
}

export function printSuccess(message: string) {
    console.log(`\n✅ ${message}`)
}

export function printKeyValue(
    label: string,
    value: string | number | null | undefined,
) {
    console.log(`  - ${label}: ${formatValue(value)}`)
}

export function printError(message: string) {
    console.error(`\n❌ 오류\n  - ${message}`)
}

export function formatValue(value: string | number | null | undefined) {
    return value === null || value === undefined || value === ''
        ? '확인 안 됨'
        : String(value)
}
