import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import {
    describeError,
    describeErrorStack,
} from '../../../common/exception/error.util'
import { LinkRepository } from '../link.repository'

import { LINK_ANALYSIS_PENDING_TIMEOUT_MS } from './link-analysis.constant'

@Injectable()
export class LinkAnalysisScheduler {
    private readonly logger = new Logger(LinkAnalysisScheduler.name)

    constructor(private readonly linkRepository: LinkRepository) {}

    @Cron('0 * * * * *', {
        name: 'link-analysis-timeout',
        waitForCompletion: true,
    })
    async failStalePendingAnalysis(): Promise<void> {
        try {
            const cutoff = new Date(
                Date.now() - LINK_ANALYSIS_PENDING_TIMEOUT_MS,
            )
            const count =
                await this.linkRepository.failStalePendingAnalysis(cutoff)

            if (count > 0) {
                this.logger.warn(
                    `링크 분석 대기 시간이 초과되어 FAILED로 변경했습니다. count=${count}`,
                )
            }
        } catch (error) {
            this.logger.error(
                `링크 분석 타임아웃 상태 저장에 실패했습니다: ${describeError(error)}`,
                describeErrorStack(error),
            )
        }
    }
}
