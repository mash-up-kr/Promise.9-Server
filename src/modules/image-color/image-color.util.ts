import { ImageColorValue } from './types/image-color.type'

export function toImageColorValue(
    rgb: [number, number, number],
): ImageColorValue {
    const normalizedRgb = normalizeRgb(rgb)
    const luminance = getRelativeLuminance(normalizedRgb)
    const textColor = luminance > 0.179 ? '#000' : '#fff'

    return {
        hex: toHex(normalizedRgb),
        rgb: normalizedRgb,
        textColor,
        luminance,
        isDark: textColor === '#fff',
    }
}

function normalizeRgb(rgb: [number, number, number]): [number, number, number] {
    return rgb.map((value) =>
        Math.max(0, Math.min(255, Math.round(value))),
    ) as [number, number, number]
}

function toHex(rgb: [number, number, number]): string {
    return `#${rgb
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`
}

function getRelativeLuminance([red, green, blue]: [
    number,
    number,
    number,
]): number {
    const [r, g, b] = [red, green, blue].map((value) => {
        const channel = value / 255

        return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
    })

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
