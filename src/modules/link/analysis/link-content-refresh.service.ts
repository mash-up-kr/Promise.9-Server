import { Injectable } from '@nestjs/common'

import { LinkRepository } from '../link.repository'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'

// 만료·정책 기한 전에 미리 갱신할 여유 시간
// (Instagram CDN 썸네일은 4~5일 TTL, YouTube는 30일 정책 주기).
const CONTENT_REFRESH_LEAD_TIME_MS = 24 * 60 * 60 * 1000
// 한 번에 조회할 상한. 상한을 넘긴 나머지는 다음 스케줄러 실행에서 이어서 처리한다.
const CONTENT_REFRESH_QUERY_LIMIT = 500

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

        for (const link of targets) {
            this.linkAnalysisDispatcher.dispatch(
                {
                    linkId: link.id,
                    userId: link.userId,
                    url: link.finalUrl ?? link.originalUrl,
                },
                ['CONTENT'],
            )
        }

        return targets.length
    }
}
