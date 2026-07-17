import { Injectable } from '@nestjs/common'

import { OgFetcherService } from './og-fetcher.service'
import { parseOg } from './og-parser'

export interface LinkPreview {
    title: string | null
    thumbnailUrl: string | null
    source: string
}

@Injectable()
export class OgService {
    constructor(private readonly ogFetcher: OgFetcherService) {}

    // URL의 OG 메타데이터에서 미리보기용 title·thumbnailUrl·source를 뽑는다.
    async preview(url: string): Promise<LinkPreview> {
        const { html, finalUrl } = await this.ogFetcher.fetchHtml(url)
        const { title, image } = parseOg(html)

        return {
            title,
            thumbnailUrl: this.toAbsoluteImage(image, finalUrl),
            source: this.toSource(finalUrl),
        }
    }

    // og:image가 상대경로일 수 있어 최종 URL 기준 절대경로로 바꾼다.
    private toAbsoluteImage(image: string | null, baseUrl: URL): string | null {
        if (!image) return null

        try {
            return new URL(image, baseUrl).toString()
        } catch {
            return null
        }
    }

    // 최종 URL의 호스트에서 표시용 도메인(선행 www. 제거)을 만든다.
    private toSource(finalUrl: URL): string {
        return finalUrl.hostname.replace(/^www\./, '')
    }
}
