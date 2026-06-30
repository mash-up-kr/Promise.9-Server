import { ResolvedImageFetchOptions } from './image-fetcher.type'

export const DEFAULT_IMAGE_FETCH_OPTIONS = {
    timeoutMs: 5000,
    maxBytes: 5 * 1024 * 1024,
    maxRedirects: 3,
} satisfies ResolvedImageFetchOptions

export const MAX_IMAGE_FETCH_OPTIONS = {
    timeoutMs: 10000,
    maxBytes: 10 * 1024 * 1024,
    maxRedirects: 5,
} satisfies ResolvedImageFetchOptions

export const IMAGE_REDIRECT_STATUSES: readonly number[] = [
    301, 302, 303, 307, 308,
]
