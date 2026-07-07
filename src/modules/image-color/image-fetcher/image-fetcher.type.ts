export interface ImageFetchOptions {
    timeoutMs?: number
    maxBytes?: number
    maxRedirects?: number
}

export interface ResolvedImageFetchOptions {
    timeoutMs: number
    maxBytes: number
    maxRedirects: number
}

export interface FetchedImage {
    sourceUrl: string
    contentType: string
    byteLength: number
    buffer: Buffer
}

export interface ReadImageResponseResult {
    contentType: string
    buffer: Buffer
}
