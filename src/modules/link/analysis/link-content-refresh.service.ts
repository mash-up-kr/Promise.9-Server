import { Injectable } from '@nestjs/common'

import { LinkRepository } from '../link.repository'
import { CONTENT_REFRESH_COOLDOWN_MS } from '../link.util'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'

// 만료·정책 기한 전에 미리 갱신할 여유 시간
// (Instagram CDN 썸네일은 4~5일 TTL, YouTube는 30일 정책 주기).
const CONTENT_REFRESH_LEAD_TIME_MS = 24 * 60 * 60 * 1000
// 한 번에 조회할 상한. 상한을 넘긴 나머지는 다음 스케줄러 실행에서 이어서 처리한다.
const CONTENT_REFRESH_QUERY_LIMIT = 500
// 동시에 실행할 재수집 수. 재수집 1건이 약 2.5초(TinyFish 수집 + 이미지 색상 추출)이므로
// 2건이면 분당 약 48회다. TinyFish 키의 분당 예산(135)에서 배경 갱신이 절반 이하만 쓰고
// 나머지를 사용자 요청(링크 저장·미리보기) 몫으로 남기기 위한 값이다.
// 500건을 처리해도 약 10분이라 12시간 주기 안에서는 여유가 있다.
const CONTENT_REFRESH_CONCURRENCY = 2

@Injectable()
export class LinkContentRefreshService {
    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly linkAnalysisDispatcher: LinkAnalysisDispatcher,
    ) {}

    // CONTENT를 재실행해 썸네일(TTL 만료 전)과 YouTube 메타데이터(30일 정책)를 새로 수집하고,
    // 이어서 EMBEDDING을 돌린다. 제목이 임베딩 입력이라 CONTENT만 돌리면 벡터가 옛 제목에
    // 묶여 검색 순위가 화면과 어긋난다. run()이 CONTENT 실패 시 EMBEDDING을 막아준다.
    // ponytail: 제목이 그대로여도 매번 임베딩을 다시 만든다. 호출당 비용이 미미해 변경 감지를
    // 넣지 않았고, 임베딩 호출량이 문제가 되면 제목 변경 시에만 실행하도록 좁힌다.
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
                            ['CONTENT', 'EMBEDDING'],
                        ),
                    ),
            )
        }

        return targets.length
    }
}
