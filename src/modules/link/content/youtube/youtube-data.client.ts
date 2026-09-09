import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { z } from 'zod'

import { ValidatedEnvironment } from '../../../../config/environment'
import { LINK_CONTENT_FETCH } from '../link-content.constants'
import {
    cancelLinkContentResponse,
    readLinkContentText,
} from '../link-content-response.reader'

const thumbnailSchema = z.object({ url: z.string() })
const youtubeVideosSchema = z.object({
    items: z.array(
        z.object({
            id: z.string(),
            snippet: z.object({
                title: z.string().trim().min(1),
                description: z.string().optional(),
                thumbnails: z
                    .object({
                        maxres: thumbnailSchema.optional(),
                        standard: thumbnailSchema.optional(),
                        high: thumbnailSchema.optional(),
                        medium: thumbnailSchema.optional(),
                        default: thumbnailSchema.optional(),
                    })
                    .optional(),
            }),
        }),
    ),
})

export type YoutubeVideo = {
    title: string
    description: string | null
    image: string | null
}

@Injectable()
export class YoutubeDataClient {
    private readonly logger = new Logger(YoutubeDataClient.name)
    private readonly apiKey: string | undefined

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.apiKey = config.get('YOUTUBE_API_KEY', { infer: true })
        if (!this.apiKey) {
            this.logger.warn(
                'YOUTUBE_API_KEY가 없어 YouTube는 oEmbed로 수집합니다.',
            )
        }
    }

    async fetchVideo(videoId: string): Promise<YoutubeVideo | null> {
        if (!this.apiKey) return null

        const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos')
        endpoint.searchParams.set('part', 'snippet')
        endpoint.searchParams.set('id', videoId)
        endpoint.searchParams.set(
            'fields',
            'items(id,snippet(title,description,thumbnails))',
        )
        endpoint.searchParams.set('key', this.apiKey)
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            const response = await fetch(endpoint, {
                headers: { Accept: 'application/json' },
                redirect: 'error',
                signal: controller.signal,
            })

            if (!response.ok) {
                cancelLinkContentResponse(response)
                // 키가 포함될 수 있는 원격 응답·요청 URL은 로그와 예외에 넣지 않는다.
                // 호출부는 오류 종류와 관계없이 oEmbed 폴백을 실행한다.
                throw new HttpException(
                    `YouTube Data API 수집에 실패했습니다. HTTP ${response.status}`,
                    response.status,
                )
            }

            const result = youtubeVideosSchema.parse(
                JSON.parse(await readLinkContentText(response)),
            )
            const snippet = result.items.find(
                (item) => item.id === videoId,
            )?.snippet
            if (!snippet) return null
            const thumbnails = snippet.thumbnails
            const image =
                [
                    thumbnails?.maxres,
                    thumbnails?.standard,
                    thumbnails?.high,
                    thumbnails?.medium,
                    thumbnails?.default,
                ]
                    .map((candidate) => candidate?.url.trim())
                    .find(Boolean) ?? null
            return {
                title: snippet.title,
                description: snippet.description?.trim() || null,
                image,
            }
        } catch (error) {
            if (error instanceof HttpException) throw error

            throw new HttpException(
                controller.signal.aborted
                    ? 'YouTube Data API 수집 시간이 초과됐습니다.'
                    : 'YouTube Data API 응답을 처리하지 못했습니다.',
                502,
            )
        } finally {
            clearTimeout(timeout)
        }
    }
}
