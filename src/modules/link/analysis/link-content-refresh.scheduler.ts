import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { LinkContentRefreshService } from './link-content-refresh.service'

@Injectable()
export class LinkContentRefreshScheduler {
    private readonly logger = new Logger(LinkContentRefreshScheduler.name)

    constructor(
        private readonly contentRefreshService: LinkContentRefreshService,
    ) {}

    @Cron('0 0 */12 * * *', {
        name: 'link-content-refresh',
        waitForCompletion: true,
    })
    async refreshDueLinks() {
        try {
            const targetCount =
                await this.contentRefreshService.refreshDueLinks()

            if (targetCount === 0) return

            this.logger.log(
                `CONTENT 재수집 대상을 갱신 예약했습니다. target=${targetCount}`,
            )
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.error(
                `콘텐츠 갱신 스케줄러 실행에 실패했습니다. error=${message}`,
                error instanceof Error ? error.stack : undefined,
            )
        }
    }
}
