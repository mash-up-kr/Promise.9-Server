export interface NodeVibrantPaletteColor {
    hex: string
    rgb: [number, number, number]
    hsl: [number, number, number]
    population: number
    titleTextColor: string
    bodyTextColor: string
}

export interface NodeVibrantPaletteColors {
    vibrant: NodeVibrantPaletteColor | null
    muted: NodeVibrantPaletteColor | null
    darkVibrant: NodeVibrantPaletteColor | null
    darkMuted: NodeVibrantPaletteColor | null
    lightVibrant: NodeVibrantPaletteColor | null
    lightMuted: NodeVibrantPaletteColor | null
}

export interface NodeVibrantImageColorResult {
    colors: NodeVibrantPaletteColors
}
