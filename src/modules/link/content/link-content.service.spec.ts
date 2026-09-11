import { HttpException, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'

import { LinkContentHtmlFetcher } from './html/link-content-html.fetcher'
import { TinyFishFetchClient } from './tinyfish/tinyfish-fetch.client'
import { TinyFishFetchError } from './tinyfish/tinyfish-fetch.error'
import { YoutubeDataClient } from './youtube/youtube-data.client'
import {
    LINK_CONTENT_BROWSER_USER_AGENT,
    LINK_CONTENT_IMAGE_URL_MAX_LENGTH,
} from './link-content.constants'
import { LinkContentService } from './link-content.service'

describe('LinkContentService', () => {
    let service: LinkContentService
    let urlSecurity: jest.Mocked<
        Pick<UrlSecurityService, 'parseHttpUrl' | 'resolvePublicUrl'>
    >
    let fetchSpy: jest.SpiedFunction<typeof fetch>
    let tinyFishFetchClient: jest.Mocked<
        Pick<TinyFishFetchClient, 'isEnabled' | 'fetch'>
    >
    let youtubeDataClient: jest.Mocked<
        Pick<YoutubeDataClient, 'fetchVideo' | 'isEnabled'>
    >

    beforeEach(() => {
        urlSecurity = {
            parseHttpUrl: jest.fn((rawUrl: string, baseUrl?: URL) => {
                const url = new URL(rawUrl, baseUrl)

                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error('unsupported protocol')
                }

                return url
            }),
            resolvePublicUrl: jest.fn().mockResolvedValue({
                address: '93.184.216.34',
            }),
        }
        fetchSpy = jest.spyOn(global, 'fetch')
        tinyFishFetchClient = {
            isEnabled: jest.fn().mockReturnValue(false),
            fetch: jest.fn(),
        }
        youtubeDataClient = {
            isEnabled: jest.fn().mockReturnValue(true),
            fetchVideo: jest.fn().mockResolvedValue(null),
        }
        service = new LinkContentService(
            urlSecurity as unknown as UrlSecurityService,
            new LinkContentHtmlFetcher(
                urlSecurity as unknown as UrlSecurityService,
            ),
            tinyFishFetchClient as unknown as TinyFishFetchClient,
            youtubeDataClient as unknown as YoutubeDataClient,
        )
    })

    afterEach(() => {
        fetchSpy.mockRestore()
    })

    it('네이버 공유 링크를 풀어 모바일 장소를 한 번 수집하고 미리보기·저장에 같은 전략을 사용한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy.mockResolvedValue(
            new Response(null, {
                status: 302,
                headers: {
                    location:
                        'https://map.naver.com/p/entry/place/31048068?lng=126',
                },
            }),
        )
        const image =
            'https://search.pstatic.net/common/?type=w560_sharpen&src=https%3A%2F%2Fldb.phinf.naver.net%2Fphoto.jpg'
        tinyFishFetchClient.fetch.mockResolvedValue({
            status: 'SUCCESS',
            content: {
                title: '모모야 이촌본점 : 네이버\u001c',
                description: '장소 설명',
                content: '주소',
                imageLinks: [
                    'https://g-place.pstatic.net/assets/shared/images/icon_default_profile.png',
                    image,
                ],
            },
        })
        await expect(
            service.preview('https://naver.me/example'),
        ).resolves.toEqual({
            title: '모모야 이촌본점',
            thumbnailUrl: image,
            source: 'map.naver.com',
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
        expect(tinyFishFetchClient.fetch.mock.calls[0][0].toString()).toBe(
            'https://m.place.naver.com/place/31048068/home',
        )
        await expect(
            service.collect(
                'https://m.place.naver.com/restaurant/31048068/home',
            ),
        ).resolves.toMatchObject({
            title: '모모야 이촌본점',
            image: { url: image, source: 'tinyfish' },
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('단축 URL이 내부망으로 연결되면 TinyFish에 전달하지 않는다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy.mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: { location: 'http://127.0.0.1/private' },
            }),
        )
        urlSecurity.resolvePublicUrl
            .mockResolvedValueOnce({ address: '93.184.216.34' })
            .mockRejectedValueOnce(new HttpException('blocked', 400))
        await expect(
            service.preview('https://naver.me/example'),
        ).rejects.toThrow('blocked')
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
    })

    it('단축 URL 순환은 제한된 요청 후 중단한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy.mockResolvedValue(
            new Response(null, { status: 302, headers: { location: '/loop' } }),
        )
        await expect(
            service.preview('https://naver.me/example'),
        ).rejects.toThrow()
        expect(fetchSpy).toHaveBeenCalledTimes(4)
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
    })

    it('지도 이외의 네이버 공유 링크는 기존 HTML 수집을 사용한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: { location: 'https://example.com/article' },
                }),
            )
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(new Response('<title>일반 글</title>'))
        await expect(
            service.preview('https://naver.me/example'),
        ).resolves.toMatchObject({ title: '일반 글', source: 'example.com' })
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
        expect(fetchSpy.mock.calls[1][0]).toEqual(
            new URL('https://example.com/robots.txt'),
        )
    })

    it('YouTube 미리보기는 API 사용 가능 여부와 관계없이 oEmbed만 조회한다', async () => {
        youtubeDataClient.fetchVideo.mockResolvedValueOnce({
            title: 'API 제목',
            description: 'API 설명',
            image: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
        })
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: 'oEmbed 제목',
                thumbnail_url:
                    'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            }),
        )
        await expect(
            service.preview('https://www.youtube.com/watch?v=8Pbt-Aum5Q4'),
        ).resolves.toEqual({
            title: 'oEmbed 제목',
            thumbnailUrl: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            source: 'youtube.com',
        })
        expect(youtubeDataClient.fetchVideo).not.toHaveBeenCalled()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect((fetchSpy.mock.calls[0][0] as URL).pathname).toBe('/oembed')
    })

    it.each([
        'https://www.youtube.com/watch?v=8Pbt-Aum5Q4&list=playlist',
        'https://youtu.be/8Pbt-Aum5Q4?si=share',
        'https://www.youtube.com/shorts/8Pbt-Aum5Q4',
        'https://www.youtube.com/embed/8Pbt-Aum5Q4',
    ])(
        'YouTube 저장 수집은 Data API만으로 메타데이터를 반환한다: %s',
        async (url) => {
            youtubeDataClient.fetchVideo.mockResolvedValueOnce({
                title: 'API 제목',
                description: '영상 설명\n두 번째 줄',
                image: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
            })
            await expect(service.collect(url)).resolves.toEqual({
                title: 'API 제목',
                description: '영상 설명\n두 번째 줄',
                content: null,
                image: {
                    url: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
                    source: 'youtube-data-api',
                },
                // 공식 API 응답이므로 필드 부재를 삭제로 해석할 수 있다.
                authoritative: true,
            })
            expect(youtubeDataClient.fetchVideo).toHaveBeenCalledWith(
                '8Pbt-Aum5Q4',
            )
            expect(fetchSpy).not.toHaveBeenCalled()
            expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
        },
    )

    // 삭제·비공개 영상은 폴백으로 옛 메타데이터를 되살리면 안 된다.
    it('Data API가 영상을 찾지 못하면 폴백 없이 부재를 그대로 반환한다', async () => {
        youtubeDataClient.fetchVideo.mockResolvedValueOnce(null)

        await expect(
            service.collect('https://youtu.be/8Pbt-Aum5Q4'),
        ).resolves.toEqual({
            title: null,
            description: null,
            content: null,
            image: null,
            authoritative: true,
        })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('Data API 키가 없으면 영상 부재로 보지 않고 oEmbed로 폴백한다', async () => {
        youtubeDataClient.isEnabled.mockReturnValue(false)
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: 'oEmbed 제목',
                thumbnail_url: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
            }),
        )

        const result = await service.collect('https://youtu.be/8Pbt-Aum5Q4')

        expect(result?.title).toBe('oEmbed 제목')
        expect(result?.authoritative).toBeUndefined()
        expect(youtubeDataClient.fetchVideo).not.toHaveBeenCalled()
    })

    it.each(['preview', 'collect'] as const)(
        'oEmbed 사용 시 목적에 따라 Data API 호출 여부를 구분한다: %s',
        async (method) => {
            // Data API 실패는 폴백 경로다. 영상 부재(null)는 삭제로 해석하므로 폴백하지 않는다.
            youtubeDataClient.fetchVideo.mockRejectedValueOnce(
                new Error('Data API 실패'),
            )
            fetchSpy.mockResolvedValueOnce(
                jsonResponse({
                    title: 'oEmbed 제목',
                    thumbnail_url:
                        'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
                }),
            )
            const result = await service[method]('https://youtu.be/8Pbt-Aum5Q4')
            expect(result?.title).toBe('oEmbed 제목')
            if (method === 'collect') {
                expect(
                    youtubeDataClient.fetchVideo.mock.invocationCallOrder[0],
                ).toBeLessThan(fetchSpy.mock.invocationCallOrder[0])
            } else {
                expect(youtubeDataClient.fetchVideo).not.toHaveBeenCalled()
            }
            expect(fetchSpy).toHaveBeenCalledTimes(1)
        },
    )

    it.each([403, 429, 500, 502])(
        'Data API HTTP %i 실패에도 oEmbed 결과로 저장 수집을 계속한다',
        async (status) => {
            youtubeDataClient.fetchVideo.mockRejectedValueOnce(
                new HttpException('API 실패', status),
            )
            fetchSpy.mockResolvedValueOnce(
                jsonResponse({
                    title: '폴백 제목',
                    thumbnail_url:
                        'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
                }),
            )
            await expect(
                service.collect('https://youtu.be/8Pbt-Aum5Q4'),
            ).resolves.toEqual({
                title: '폴백 제목',
                description: null,
                content: null,
                image: {
                    url: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/high.jpg',
                    source: 'oembed',
                },
            })
            expect(
                youtubeDataClient.fetchVideo.mock.invocationCallOrder[0],
            ).toBeLessThan(fetchSpy.mock.invocationCallOrder[0])
        },
    )

    it.each(['preview', 'collect'] as const)(
        'oEmbed 실패 시 기존 HTML 정책으로 폴백하며 미리보기는 Data API를 생략한다: %s',
        async (method) => {
            youtubeDataClient.fetchVideo.mockRejectedValueOnce(
                new Error('timeout'),
            )
            fetchSpy.mockResolvedValueOnce(new Response('', { status: 503 }))
            fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }))
            fetchSpy.mockResolvedValueOnce(
                htmlResponse(
                    '<title>HTML 제목</title><meta name="description" content="HTML 설명"><body>추천 영상 메뉴</body>',
                ),
            )
            const result = await service[method](
                'https://www.youtube.com/watch?v=8Pbt-Aum5Q4',
            )
            expect(result?.title).toBe('HTML 제목')
            expect(fetchSpy).toHaveBeenCalledTimes(3)
            expect(fetchSpy.mock.calls[1][0]).toEqual(
                new URL('https://www.youtube.com/robots.txt'),
            )
            if (method === 'collect') {
                expect(result).toMatchObject({
                    description: 'HTML 설명',
                    content: null,
                })
            } else {
                expect(youtubeDataClient.fetchVideo).not.toHaveBeenCalled()
            }
        },
    )

    it('모든 수집 경로의 네트워크 실패는 호출부로 전달한다', async () => {
        youtubeDataClient.fetchVideo.mockRejectedValueOnce(new Error('timeout'))
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockRejectedValueOnce(new Error('network failure'))
        await expect(
            service.collect('https://youtu.be/8Pbt-Aum5Q4'),
        ).rejects.toBeInstanceOf(BaseException)
    })

    it('Data API 성공 시 설명·이미지가 없어도 불필요한 폴백을 하지 않는다', async () => {
        youtubeDataClient.fetchVideo.mockResolvedValueOnce({
            title: '제목',
            description: null,
            image: null,
        })
        await expect(
            service.collect('https://youtu.be/8Pbt-Aum5Q4'),
        ).resolves.toMatchObject({
            title: '제목',
            description: null,
            content: null,
        })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('Data API 이미지에도 공개 URL 검증과 기존 설명 길이 제한을 적용한다', async () => {
        youtubeDataClient.fetchVideo.mockResolvedValueOnce({
            title: '제목',
            description: '가'.repeat(2500),
            image: 'http://127.0.0.1/private.png',
        })
        urlSecurity.resolvePublicUrl.mockRejectedValueOnce(new Error('blocked'))
        const result = await service.collect('https://youtu.be/8Pbt-Aum5Q4')
        expect(result?.description).toHaveLength(2000)
        expect(result?.image).toBeNull()
        expect(result?.content).toBeNull()
    })

    it('링크 미리보기에서 제목, 절대 이미지 URL, 출처를 반환한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                <meta property="og:title" content="링크 제목" />
                <meta property="og:image" content="/thumbnail.png" />
            `),
            )

        const result = await service.preview('https://www.example.com/article')

        expect(result).toEqual({
            title: '링크 제목',
            thumbnailUrl: 'https://www.example.com/thumbnail.png',
            source: 'example.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('robots.txt가 차단한 미리보기는 HTML을 요청하지 않는다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response('User-agent: *\nDisallow: /', { status: 200 }),
        )

        await expect(
            service.preview('https://example.com/article'),
        ).resolves.toEqual({
            title: null,
            thumbnailUrl: null,
            source: 'example.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy.mock.calls[0][0]).toEqual(
            new URL('https://example.com/robots.txt'),
        )
    })

    it('일반 링크는 기존 브라우저 User-Agent로 HTML을 요청한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(htmlResponse('<title>링크 제목</title>'))

        await service.preview('https://example.com/article')

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[1]

        expect(requestUrl).toEqual(new URL('https://example.com/article'))
        expect(requestOptions?.headers).toMatchObject({
            'User-Agent': LINK_CONTENT_BROWSER_USER_AGENT,
        })
    })

    it('Brunch 링크만 링크 수집기 User-Agent로 HTML을 요청한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(htmlResponse('<title>Brunch 제목</title>'))

        await service.preview('https://brunch.co.kr/@author/1')

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[1]

        expect(requestUrl).toEqual(new URL('https://brunch.co.kr/@author/1'))
        expect(requestOptions?.headers).toMatchObject({
            'User-Agent': 'Promise9Bot/1.0',
        })
    })

    it('Brunch 저장 수집은 robots.txt와 HTML에 같은 전용 User-Agent를 사용한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(htmlResponse('<title>Brunch 제목</title>'))

        await service.collect('https://brunch.co.kr/@author/1')

        expect(fetchSpy).toHaveBeenCalledTimes(2)

        for (const [, requestOptions] of fetchSpy.mock.calls) {
            expect(requestOptions?.headers).toMatchObject({
                'User-Agent': 'Promise9Bot/1.0',
            })
        }
    })

    it('HTML 리다이렉트마다 도메인에 맞는 User-Agent를 다시 선택한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: {
                        location: 'https://brunch.co.kr/@author/1',
                    },
                }),
            )
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(htmlResponse('<title>Brunch 제목</title>'))

        await service.preview('https://example.com/redirect')

        expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
            'User-Agent': LINK_CONTENT_BROWSER_USER_AGENT,
        })
        expect(fetchSpy.mock.calls[3][1]?.headers).toMatchObject({
            'User-Agent': 'Promise9Bot/1.0',
        })
    })

    it('YouTube 미리보기는 oEmbed 제목과 썸네일을 사용한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: '식인섬에서 살아남기',
                thumbnail_url:
                    'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            }),
        )

        const resourceUrl = 'https://www.youtube.com/watch?v=8Pbt-Aum5Q4&t=14s'
        const result = await service.preview(resourceUrl)

        expect(result).toEqual({
            title: '식인섬에서 살아남기',
            thumbnailUrl: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            source: 'youtube.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[0]
        const endpoint = requestUrl as URL

        expect(endpoint.origin + endpoint.pathname).toBe(
            'https://www.youtube.com/oembed',
        )
        expect(endpoint.searchParams.get('url')).toBe(resourceUrl)
        expect(endpoint.searchParams.get('format')).toBe('json')
        expect(requestOptions?.headers).toMatchObject({
            Accept: 'application/json',
        })
    })

    it('X 미리보기는 TinyFish 결과만 사용하고 로컬 OG를 요청하지 않는다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValueOnce(true)
        tinyFishFetchClient.fetch.mockResolvedValueOnce({
            status: 'SUCCESS',
            content: {
                title: 'OpenAI (@OpenAI) on X',
                description: 'X 게시물 본문',
                content:
                    'OpenAI\n\n@OpenAI\n\nX 게시물 본문\n\n1:32 PM · Apr 3, 2026\n12',
                imageLinks: ['https://pbs.twimg.com/media/example.jpg'],
            },
        })

        const result = await service.preview(
            'https://x.com/OpenAI/status/2041581000120267067?ref_src=test',
        )

        expect(result).toEqual({
            title: 'X 게시물 본문',
            thumbnailUrl: 'https://pbs.twimg.com/media/example.jpg',
            source: 'x.com',
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledWith(
            new URL('https://x.com/OpenAI/status/2041581000120267067'),
            expect.objectContaining({
                includeSelectors: [
                    'article:has(a:is([href$="/status/2041581000120267067"], [href*="/status/2041581000120267067?"], [href*="/status/2041581000120267067#"], [href*="/status/2041581000120267067/"]))',
                ],
            }),
        )
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
    })

    it('Behance 프로젝트는 각 요청에서 본문 범위를 TinyFish로 한 번 수집한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        const image =
            'https://mir-s3-cdn-cf.behance.net/project_modules/1400/3712d4122200727.60da38c094d9e.jpg'
        tinyFishFetchClient.fetch.mockResolvedValue({
            status: 'SUCCESS',
            content: {
                title: 'Google Feature Drop',
                description: '프로젝트 설명',
                content: '프로젝트 본문',
                imageLinks: [
                    'https://pps.services.adobe.com/api/profile/id/image/50',
                    image,
                ],
            },
        })
        const resourceUrl =
            'https://be.net/gallery/122200727/Google-Feature-Drop?tracking_source=search'

        await expect(service.preview(resourceUrl)).resolves.toEqual({
            title: 'Google Feature Drop',
            thumbnailUrl: image,
            source: 'behance.net',
        })
        await expect(service.collect(resourceUrl)).resolves.toEqual({
            title: 'Google Feature Drop',
            description: '프로젝트 설명',
            content: '프로젝트 본문',
            image: { url: image, source: 'tinyfish' },
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(2)
        expect(tinyFishFetchClient.fetch).toHaveBeenNthCalledWith(
            1,
            new URL(
                'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
            ),
            { includeSelectors: ['.project-content-wrap'] },
        )
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('TinyFish API key가 없으면 Behance 프로젝트도 기존 HTML 수집을 사용한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="Behance 프로젝트" />
                    <meta property="og:image" content="https://mir-s3-cdn-cf.behance.net/project_modules/1400/project.jpg" />
                `),
            )

        await expect(
            service.preview(
                'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
            ),
        ).resolves.toEqual({
            title: 'Behance 프로젝트',
            thumbnailUrl:
                'https://mir-s3-cdn-cf.behance.net/project_modules/1400/project.jpg',
            source: 'behance.net',
        })
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('무신사 상품은 canonical 상세 영역을 요청하고 대상 상품 이미지만 사용한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        const image =
            'https://image.msscdn.net/thumbnails/images/goods_img/20240913/4438679/4438679_big.jpg?w=1200'
        tinyFishFetchClient.fetch.mockResolvedValue({
            status: 'SUCCESS',
            content: {
                title: '윈터 퍼그 숏부츠 [블랙]',
                description: '무신사 상품 설명',
                content: '상품 정보',
                imageLinks: [
                    'https://image.msscdn.net/images/goods_img/20240913/4438681/other.jpg',
                    image,
                ],
            },
        })

        await expect(
            service.preview(
                'https://store.musinsa.com/app/goods/4438679?utm_source=share',
            ),
        ).resolves.toEqual({
            title: '윈터 퍼그 숏부츠 [블랙]',
            thumbnailUrl: image,
            source: 'musinsa.com',
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledWith(
            new URL('https://www.musinsa.com/products/4438679'),
            { includeSelectors: ['#commonLayoutContents'] },
        )
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('쿠팡 공유 링크를 안전하게 해석해 상품 옵션만 유지하고 한 번 수집한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy.mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: {
                    location:
                        'https://www.coupang.com/vp/products/9332072213?itemId=27669136218&vendorItemId=94631318376&sourceType=share',
                },
            }),
        )
        const image =
            'https://thumbnail7.coupangcdn.com/thumbnails/remote/657x657q90trim/image/retail/images/product.jpg.webp'
        tinyFishFetchClient.fetch.mockResolvedValueOnce({
            status: 'SUCCESS',
            content: {
                title: 'AEROGLASS 강화유리 게이밍 마우스패드',
                description: '쿠팡 상품 설명',
                content: '상품 정보',
                imageLinks: [
                    'https://image7.coupangcdn.com/image/coupang/rds/logo/rocket.png',
                    image,
                ],
            },
        })

        await expect(
            service.collect('https://link.coupang.com/a/dQoJQa'),
        ).resolves.toEqual({
            title: 'AEROGLASS 강화유리 게이밍 마우스패드',
            description: '쿠팡 상품 설명',
            content: '상품 정보',
            image: { url: image, source: 'tinyfish' },
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledWith(
            new URL(
                'https://www.coupang.com/vp/products/9332072213?itemId=27669136218&vendorItemId=94631318376',
            ),
        )
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('쿠팡 공유 링크가 내부망으로 연결되면 TinyFish에 전달하지 않는다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        fetchSpy.mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: { location: 'http://127.0.0.1/private' },
            }),
        )
        urlSecurity.resolvePublicUrl
            .mockResolvedValueOnce({ address: '93.184.216.34' })
            .mockRejectedValueOnce(new HttpException('blocked', 400))

        await expect(
            service.preview('https://link.coupang.com/a/example'),
        ).rejects.toThrow('blocked')
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
    })

    it('X 저장 수집은 정리한 본문과 제목을 반환하며 데이터가 전부 없으면 재시도한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        tinyFishFetchClient.fetch.mockResolvedValueOnce({
            status: 'SUCCESS',
            content: {
                title: 'NASA (@NASA) on X',
                description: '본문',
                content: 'NASA\n@NASA\n본문\n1:32 PM · Apr 3, 2026\n12',
                imageLinks: [],
            },
        })
        await expect(
            service.collect('https://x.com/NASA/status/123'),
        ).resolves.toMatchObject({
            title: '본문',
            description: '본문',
            content: '본문',
            image: null,
        })
        tinyFishFetchClient.fetch.mockResolvedValueOnce({
            status: 'SUCCESS',
            content: {
                title: 'X',
                description: null,
                content: 'loading',
                imageLinks: [],
            },
        })
        await expect(
            service.collect('https://x.com/NASA/status/123'),
        ).rejects.toMatchObject({ retryable: true })
    })

    it.each(['preview', 'collect'] as const)(
        '본문 파싱이 안 돼도 자체 이미지를 반환한다: %s',
        async (method) => {
            tinyFishFetchClient.isEnabled.mockReturnValue(true)
            tinyFishFetchClient.fetch.mockResolvedValueOnce({
                status: 'SUCCESS',
                content: {
                    title: 'X',
                    description: null,
                    content: '알 수 없는 본문 형식',
                    imageLinks: ['https://pbs.twimg.com/media/own.jpg'],
                },
            })
            const result = await service[method](
                'https://x.com/NASA/status/123',
            )
            expect(result).toMatchObject(
                method === 'preview'
                    ? {
                          title: null,
                          thumbnailUrl: 'https://pbs.twimg.com/media/own.jpg',
                      }
                    : {
                          title: null,
                          content: null,
                          image: { url: 'https://pbs.twimg.com/media/own.jpg' },
                      },
            )
            expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
        },
    )

    it('자체 이미지가 없으면 추가 조회 없이 본문과 null 이미지를 반환한다', async () => {
        tinyFishFetchClient.isEnabled.mockReturnValue(true)
        tinyFishFetchClient.fetch.mockResolvedValueOnce({
            status: 'SUCCESS',
            content: {
                title: 'NASA',
                description: '자체 본문',
                content: 'NASA\n@NASA\n자체 본문\n1:32 PM · Apr 3, 2026',
                imageLinks: [
                    'https://pbs.twimg.com/profile_images/123/avatar.jpg',
                ],
            },
        })
        expect(
            await service.collect('https://x.com/NASA/status/123'),
        ).toMatchObject({
            title: '자체 본문',
            content: '자체 본문',
            image: null,
        })
        expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
    })

    it('TinyFish API key가 없으면 원본 URL로 HTML 수집을 계속한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(htmlResponse('<title>폴백 제목</title>'))

        const resourceUrl =
            'https://x.com/OpenAI/status/2041581000120267067?ref_src=test'
        const result = await service.preview(resourceUrl)

        expect(result.title).toBe('폴백 제목')
        expect(fetchSpy).toHaveBeenCalledWith(
            new URL(resourceUrl),
            expect.any(Object),
        )
        expect(tinyFishFetchClient.fetch).not.toHaveBeenCalled()
    })

    describe('Instagram captioned 단일 요청', () => {
        const cover =
            'https://scontent.cdninstagram.com/v/t51.82787-15/683900142_18588123742054628_1842156675459391844_n.jpg?ig_cache_key=' +
            Buffer.from('388986895621733439418588123736054628').toString(
                'base64',
            )
        const caption = '캡션 첫 줄\n\n캡션 본문 #태그'
        const raw = (value: string) => `author

Original audio

View profile

291 likes

author

${value}

View all 24 comments

Add a comment...*Instagram*`
        const outcome = (value: string | null) => ({
            status: 'SUCCESS' as const,
            content: {
                title: 'Instagram',
                description: null,
                content: value,
                imageLinks: [cover],
            },
        })

        beforeEach(() => tinyFishFetchClient.isEnabled.mockReturnValue(true))

        it.each([
            ['p', 'preview'],
            ['p', 'collect'],
            ['reel', 'preview'],
            ['reel', 'collect'],
        ] as const)(
            '%s %s에서 한 번의 요청으로 캡션과 이미지를 반환한다',
            async (kind, method) => {
                tinyFishFetchClient.fetch.mockResolvedValueOnce(
                    outcome(raw(caption)),
                )
                const result = await service[method](
                    `https://www.instagram.com/${kind}/DX7lzTOJ1p6/?igsh=test`,
                )
                expect(result).toMatchObject(
                    method === 'preview'
                        ? {
                              title: '캡션 첫 줄',
                              thumbnailUrl: cover,
                              source: 'instagram.com',
                          }
                        : {
                              title: '캡션 첫 줄',
                              description: caption,
                              content: null,
                              image: { url: cover, source: 'tinyfish' },
                          },
                )
                if (method === 'collect') {
                    expect(result).not.toHaveProperty(
                        'analysisUnavailableReason',
                    )
                }
                expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
                expect(tinyFishFetchClient.fetch).toHaveBeenCalledWith(
                    new URL(
                        `https://www.instagram.com/${kind}/DX7lzTOJ1p6/embed/captioned/`,
                    ),
                )
                expect(fetchSpy).not.toHaveBeenCalled()
            },
        )

        it('긴 캡션은 설명 2,000자로 반환하고 중복 본문은 비운다', async () => {
            const longCaption = '제목\n\n' + '가'.repeat(2200)
            tinyFishFetchClient.fetch.mockResolvedValueOnce(
                outcome(raw(longCaption)),
            )
            expect(
                await service.collect('https://instagram.com/p/DX7lzTOJ1p6/'),
            ).toMatchObject({
                title: '제목',
                description: longCaption.slice(0, 2000),
                content: null,
            })
        })

        it('이미지가 없더라도 원본이나 다른 embed를 추가 요청하지 않는다', async () => {
            const result = outcome(raw(caption))
            result.content.imageLinks = []
            tinyFishFetchClient.fetch.mockResolvedValueOnce(result)
            expect(
                await service.collect(
                    'https://instagram.com/reel/DX7lzTOJ1p6/',
                ),
            ).toMatchObject({ description: caption, image: null })
            expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
        })

        it('캡션 없는 응답은 UI를 저장하지 않고 AI 분석 불가를 표시한다', async () => {
            tinyFishFetchClient.fetch.mockResolvedValueOnce(
                outcome('author\nView profile\nLike\nComment'),
            )
            const result = await service.collect(
                'https://instagram.com/reel/DX7lzTOJ1p6/',
            )
            expect(result).toMatchObject({
                title: null,
                description: null,
                content: null,
                image: { url: cover },
            })
            expect(result?.analysisUnavailableReason).toBeTruthy()
        })

        it('프로필 수집은 기존 URL과 제목을 유지한다', async () => {
            tinyFishFetchClient.fetch.mockResolvedValueOnce({
                status: 'SUCCESS',
                content: {
                    title: 'NASA (@nasa)',
                    description: '프로필 소개',
                    content: '프로필 본문',
                    imageLinks: [],
                },
            })
            expect(
                await service.preview('https://instagram.com/nasa/'),
            ).toMatchObject({ title: 'NASA (@nasa)' })
            expect(tinyFishFetchClient.fetch).toHaveBeenCalledWith(
                new URL('https://instagram.com/nasa/'),
            )
        })

        it('TinyFish 실패는 추가 조회 없이 기존 오류 처리를 따른다', async () => {
            tinyFishFetchClient.fetch.mockRejectedValueOnce(
                new TinyFishFetchError({ message: 'timeout', retryable: true }),
            )
            await expect(
                service.preview('https://instagram.com/reel/DX7lzTOJ1p6/'),
            ).rejects.toBeInstanceOf(BaseException)
            expect(tinyFishFetchClient.fetch).toHaveBeenCalledTimes(1)
        })
    })

    it('TinyFish 401의 키 인덱스는 로그에만 남기고 공통 API 예외로 변환한다', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined)
        const message =
            'TinyFish Fetch API 키 인증에 실패했습니다. status=401, keyIndex=3'
        tinyFishFetchClient.isEnabled.mockReturnValueOnce(true)
        tinyFishFetchClient.fetch.mockRejectedValueOnce(
            new TinyFishFetchError({
                message,
                retryable: false,
            }),
        )

        try {
            const error: unknown = await service
                .preview('https://x.com/OpenAI/status/1')
                .catch((error: unknown) => error)
            expect(error).toBeInstanceOf(BaseException)
            if (!(error instanceof BaseException))
                throw new Error('공통 API 예외가 필요합니다.')
            expect(error.getResponse()).toEqual({
                success: false,
                error: {
                    code: 502,
                    errorCode: 930006,
                    message:
                        '링크 미리보기 대상 페이지가 정상적으로 응답하지 않았습니다.',
                    timestamp: expect.any(String) as unknown,
                },
            })
            expect(warn).toHaveBeenCalledWith(
                `TinyFish 링크 미리보기 수집에 실패했습니다: ${message}`,
            )
        } finally {
            warn.mockRestore()
        }
    })

    it('YouTube 저장 수집은 oEmbed 제목과 썸네일만 반환한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: '영상 제목',
                thumbnail_url: 'https://i.ytimg.com/vi/video/hqdefault.jpg',
            }),
        )

        const result = await service.collect('https://youtu.be/video?t=14')

        expect(result).toEqual({
            title: '영상 제목',
            description: null,
            content: null,
            image: {
                url: 'https://i.ytimg.com/vi/video/hqdefault.jpg',
                source: 'oembed',
            },
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('YouTube oEmbed가 실패하면 기존 OG 수집으로 폴백한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="폴백 제목" />
                    <meta property="og:image" content="/fallback.jpg" />
                `),
            )

        const result = await service.preview(
            'https://www.youtube.com/watch?v=video',
        )

        expect(result).toEqual({
            title: '폴백 제목',
            thumbnailUrl: 'https://www.youtube.com/fallback.jpg',
            source: 'youtube.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(3)
        const [fallbackUrl, fallbackOptions] = fetchSpy.mock.calls[2]

        expect(fallbackUrl).toEqual(
            new URL('https://www.youtube.com/watch?v=video'),
        )
        expect(fallbackOptions?.headers).toMatchObject({
            'User-Agent': LINK_CONTENT_BROWSER_USER_AGENT,
        })
    })

    it('robots.txt가 허용한 링크에서 제목, 설명, 본문을 수집한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                new Response('User-agent: *\nAllow: /articles/', {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                htmlResponse(`
                    <html>
                        <head>
                            <meta property="og:title" content="링크 제목" />
                            <meta property="og:image" content="/thumbnail.png" />
                            <meta name="description" content="링크 설명" />
                            <script>제외할 코드</script>
                        </head>
                        <body>본문 &amp; 내용</body>
                    </html>
                `),
            )

        const result = await service.collect('https://example.com/articles/1')

        expect(result).toEqual({
            title: '링크 제목',
            description: '링크 설명',
            content: '본문 & 내용',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })
    })

    it('twitter:image만 있는 페이지도 대표 이미지 출처와 함께 수집한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta name="twitter:image" content="/twitter.png" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toEqual({
            title: null,
            description: null,
            content: null,
            image: {
                url: 'https://example.com/twitter.png',
                source: 'twitter:image',
            },
        })
    })

    it.each([
        ['HTTP 이외 스킴', 'data:image/png;base64,AAAA'],
        [
            '최대 길이를 초과한 URL',
            `https://cdn.example/${'a'.repeat(LINK_CONTENT_IMAGE_URL_MAX_LENGTH)}`,
        ],
    ])('%s의 대표 이미지는 저장하지 않는다', async (_case, imageUrl) => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="링크 제목" />
                    <meta property="og:image" content="${imageUrl}" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toMatchObject({
            title: '링크 제목',
            image: null,
        })
    })

    it('공개 호스트로 검증되지 않은 대표 이미지는 저장하지 않는다', async () => {
        urlSecurity.resolvePublicUrl.mockImplementation((url: URL) =>
            url.hostname === '127.0.0.1'
                ? Promise.reject(new Error('private address'))
                : Promise.resolve({ address: '93.184.216.34' }),
        )
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="링크 제목" />
                    <meta property="og:image" content="http://127.0.0.1/private.png" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toMatchObject({
            title: '링크 제목',
            image: null,
        })
    })

    it.each([
        ['script', 'var closedData = true', 'var truncatedData = true'],
        ['style', '.closed { display: none }', '.truncated { color: red }'],
        ['noscript', '닫힌 대체 콘텐츠', '잘린 대체 콘텐츠'],
    ])(
        'HTML 주석과 닫히지 않은 %s 내용을 본문에서 제외한다',
        async (tag, closedContent, truncatedContent) => {
            fetchSpy
                .mockResolvedValueOnce(new Response('', { status: 404 }))
                .mockResolvedValueOnce(
                    htmlResponse(`
                        <body>
                            <p>본문 앞</p>
                            <!-- 본문에 포함하지 않을 주석 -->
                            <${tag}>${closedContent}</${tag}>
                            <p>본문 뒤</p>
                            <${tag}>${truncatedContent}
                    `),
                )

            const result = await service.collect('https://example.com/article')

            expect(result?.content).toBe('본문 앞 본문 뒤')
        },
    )

    it('유사 마크업을 실행 요소로 오인해 실제 본문을 누락하지 않는다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <div data-template="> <!--">속성 본문</div>
                    <style>.item::before { content: '<script>' }</style>
                    <script>
                        const comment = '<!--'
                        const close = '</script\u00a0>'
                    </script/>
                    <main>실제 본문</main>
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result?.content).toBe('속성 본문 실제 본문')
    })

    it('robots.txt가 링크 경로를 차단하면 페이지를 요청하지 않는다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response('User-agent: *\nDisallow: /private/', {
                status: 200,
            }),
        )

        await expect(
            service.collect('https://example.com/private/1'),
        ).resolves.toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('robots.txt 조회의 일시적 5xx는 호출부가 재시도할 수 있도록 예외로 전달한다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response('', { status: 503 }))

        await expect(
            service.collect('https://example.com/article'),
        ).rejects.toHaveProperty('status', 502)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('페이지 요청의 네트워크 실패는 호출부가 재시도할 수 있도록 예외로 전달한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockRejectedValueOnce(new Error('network failed'))

        await expect(
            service.collect('https://example.com/article'),
        ).rejects.toHaveProperty('status', 502)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('수집한 제목·설명·본문을 각 입력 제한 길이로 자른다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="${'제'.repeat(600)}" />
                    <meta name="description" content="${'설'.repeat(3_000)}" />
                    <body>${'본'.repeat(17_000)}</body>
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result?.title).toHaveLength(512)
        expect(result?.description).toHaveLength(2_000)
        expect(result?.content).toHaveLength(16_000)
    })

    it('리다이렉트된 링크도 robots.txt가 허용한 경우에만 요청한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                new Response('User-agent: *\nAllow: /articles/', {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: {
                        location: 'https://redirected.example/private/1',
                    },
                }),
            )
            .mockResolvedValueOnce(
                new Response('User-agent: *\nDisallow: /private/', {
                    status: 200,
                }),
            )

        await expect(
            service.collect('https://example.com/articles/1'),
        ).resolves.toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(3)
        expect(fetchSpy).toHaveBeenNthCalledWith(
            3,
            new URL('https://redirected.example/robots.txt'),
            expect.any(Object),
        )
    })
})

function htmlResponse(html: string): Response {
    return new Response(html, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
        },
    })
}

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
    })
}
