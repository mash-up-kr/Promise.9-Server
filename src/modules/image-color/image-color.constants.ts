import {
    type NodeVibrantImageColorResult,
    type NodeVibrantPaletteColors,
} from './types/node-vibrant-image-color.type'

export const IMAGE_COLOR_SELECTION_SOURCE = {
    NODE_VIBRANT_LIGHT_VIBRANT: 'node-vibrant.lightVibrant',
    NODE_VIBRANT_VIBRANT: 'node-vibrant.vibrant',
    NODE_VIBRANT_MUTED: 'node-vibrant.muted',
    NODE_VIBRANT_DARK_VIBRANT: 'node-vibrant.darkVibrant',
    NODE_VIBRANT_DARK_MUTED: 'node-vibrant.darkMuted',
    NODE_VIBRANT_LIGHT_MUTED: 'node-vibrant.lightMuted',
    SHARP_DOMINANT_COLOR: 'sharp.dominantColor',
    SHARP_AVERAGE_COLOR: 'sharp.averageColor',
} as const

export type ImageColorSelectionSource =
    (typeof IMAGE_COLOR_SELECTION_SOURCE)[keyof typeof IMAGE_COLOR_SELECTION_SOURCE]

export const IMAGE_COLOR_SELECTION_PRIORITY = [
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_LIGHT_VIBRANT,
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_VIBRANT,
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_MUTED,
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_DARK_VIBRANT,
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_DARK_MUTED,
    IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_LIGHT_MUTED,
    IMAGE_COLOR_SELECTION_SOURCE.SHARP_DOMINANT_COLOR,
    IMAGE_COLOR_SELECTION_SOURCE.SHARP_AVERAGE_COLOR,
] satisfies ImageColorSelectionSource[]

export const EMPTY_NODE_VIBRANT_RESULT: NodeVibrantImageColorResult = {
    colors: {
        vibrant: null,
        muted: null,
        darkVibrant: null,
        darkMuted: null,
        lightVibrant: null,
        lightMuted: null,
    },
}

export const NODE_VIBRANT_COLOR_KEY_BY_SOURCE = {
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_LIGHT_VIBRANT]: 'lightVibrant',
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_VIBRANT]: 'vibrant',
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_MUTED]: 'muted',
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_DARK_VIBRANT]: 'darkVibrant',
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_DARK_MUTED]: 'darkMuted',
    [IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_LIGHT_MUTED]: 'lightMuted',
} satisfies Partial<
    Record<ImageColorSelectionSource, keyof NodeVibrantPaletteColors>
>
