import { Injectable } from '@nestjs/common'

import { LinkRepository } from '../link.repository'
import { CONTENT_REFRESH_COOLDOWN_MS } from '../link.util'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'

// 만료·정책 기한 전에 미리 갱신할 여유 시간
// (Instagram CDN 썸네일은 4~5일 TTL, YouTube는 30일 정책 주기).
const CONTENT_REFRESH_LEAD_TIME_MS = 24 * 60 * 60 * 1000
// 한 번에 조회할 상한. 상한을 넘긴 나머지는 다음 스케줄러 실행에서 이어서 처리한다.
const CONTENT_REFRESH_QUERY_LIMIT = 500
// 동시에 실행할 재수집 수. 재수집은 외부 스크래핑 API와 이미지 다운로드를 부르므로
// 한꺼번에 던지지 않고 이 폭으로 나눠 rate limit과 메모리 사용을 억제한다.
const CONTENT_REFRESH_CONCURRENCY = 5

@Injectable()
export class LinkContentRefreshService {
    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly linkAnalysisDispatcher: LinkAnalysisDispatcher,
    ) {}

    // CONTENT 작업만 재실행해 썸네일(TTL 만료 전)과 YouTube 메타데이터(30일 정책)를 새로 수집한다.
    // 기존 링크 분석 dispatcher를 그대로 태워 재시도·실패 처리를 중복 구현하지 않는다.
    async refreshDueLinks(now: Date = new Date()): Promise<number> {
        const before = new Date(now.getTime() + CONTENT_REFRESH_LEAD_TIME_MS)
        const targets = await this.linkRepository.findLinksDueForContentRefresh(
            before,
            CONTENT_REFRESH_QUERY_LIMIT,
        )

        // 실행 전에 기한을 미뤄둔다. 수집이 실패하거나 새 이미지를 못 얻어 분석이 기한을
        // 갱신하지 못해도, 기한이 과거로 남아 매 실행마다 같은 링크가 앞줄을 차지하는 것을 막는다.
        // 성공하면 분석이 실제 만료 시각으로 이 값을 덮어쓴다.
        await this.linkRepository.postponeContentRefresh(
            targets.map((link) => link.id),
            new Date(now.getTime() + CONTENT_REFRESH_COOLDOWN_MS),
        )

        for (
            let offset = 0;
            offset < targets.length;
            offset += CONTENT_REFRESH_CONCURRENCY
        ) {
            await Promise.all(
                targets
                    .slice(offset, offset + CONTENT_REFRESH_CONCURRENCY)
                    .map((link) =>
                        this.linkAnalysisDispatcher.dispatchAwaited(
                            {
                                linkId: link.id,
                                userId: link.userId,
                                url: link.finalUrl ?? link.originalUrl,
                            },
                            ['CONTENT'],
                        ),
                    ),
            )
        }

        return targets.length
    }
}
