import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import {
    RuntimeEnvironment,
    ValidatedEnvironment,
} from '../../config/environment'

import { ANALYTICS_POLICY } from './analytics.constants'
import { AnalyticsQueue, QueuedEvent } from './analytics.queue'
import { serializeServerEvent, ServerAnalyticsEvent } from './analytics-event'
import { withAnalyticsTimeout } from './analytics-timeout'
import { FirehoseTransport } from './firehose.transport'

export type TrackResult =
    | { accepted: true; eventId: string }
    | {
          accepted: false
          reason: 'disabled' | 'closing' | 'invalid_event' | 'queue_full'
      }

@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
    private readonly logger = new Logger(AnalyticsService.name)
    private readonly enabled: boolean
    private readonly environment: RuntimeEnvironment
    private readonly queue = new AnalyticsQueue()
    private timer?: ReturnType<typeof setTimeout>
    private inFlight?: Promise<void>
    private closing = false
    private failures = 0
    private retryAt = 0
    private readonly shutdown = new AbortController()

    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly transport: FirehoseTransport,
    ) {
        this.enabled = config.get('ANALYTICS_ENABLED', { infer: true })
        this.environment = config.get('APP_ENV', { infer: true })
    }

    /** accepted는 메모리 큐 수락 여부이며, AWS 저장 완료를 의미하지 않는다. */
    track(input: ServerAnalyticsEvent): TrackResult {
        if (!this.enabled) return { accepted: false, reason: 'disabled' }
        if (this.closing) return { accepted: false, reason: 'closing' }
        let event: QueuedEvent
        try {
            event = serializeServerEvent(input, this.environment)
        } catch {
            // payload/UTM/사용자 정보를 로그에 남기지 않는다.
            this.logger.warn('Analytics event rejected: invalid_event')
            return { accepted: false, reason: 'invalid_event' }
        }
        if (!this.queue.enqueue(event)) {
            this.logger.warn('Analytics event rejected: queue_full')
            return { accepted: false, reason: 'queue_full' }
        }
        if (
            this.queue.size >= ANALYTICS_POLICY.flushThreshold &&
            Date.now() >= this.retryAt
        ) {
            void this.flush()
        } else {
            this.schedule()
        }
        return { accepted: true, eventId: event.eventId }
    }

    flush(): Promise<void> {
        if (this.inFlight) return this.inFlight
        if (
            !this.enabled ||
            this.queue.size === 0 ||
            this.shutdown.signal.aborted
        )
            return Promise.resolve()
        if (!this.closing && Date.now() < this.retryAt) {
            this.schedule()
            return Promise.resolve()
        }
        clearTimeout(this.timer)
        this.timer = undefined
        this.inFlight = this.drain().finally(() => {
            this.inFlight = undefined
            this.schedule()
        })
        return this.inFlight
    }

    private async drain(): Promise<void> {
        while (this.queue.size && !this.shutdown.signal.aborted) {
            const batch = this.queue.peekBatch()
            const failed = await this.sendBatch(batch)
            this.queue.acknowledge(batch, failed)
            if (failed.length) {
                this.failures += 1
                const delay = Math.min(
                    60_000,
                    1_000 * 2 ** Math.min(this.failures, 6),
                )
                this.retryAt =
                    Date.now() + delay + Math.floor(Math.random() * 1_000)
                this.logger.warn(
                    `Analytics batch incomplete: retrying ${failed.length} records`,
                )
                return
            }
            this.failures = 0
            this.retryAt = 0
        }
    }

    private async sendBatch(batch: QueuedEvent[]): Promise<number[]> {
        try {
            return await withAnalyticsTimeout(
                (signal) =>
                    this.transport.sendBatch(
                        batch.map((event) => event.data),
                        signal,
                    ),
                ANALYTICS_POLICY.requestTimeoutMs,
                this.shutdown.signal,
            )
        } catch {
            return batch.map((_, index) => index)
        }
    }

    private schedule(): void {
        if (this.closing || this.timer || this.inFlight || !this.queue.size)
            return
        this.timer = setTimeout(
            () => {
                this.timer = undefined
                void this.flush()
            },
            Math.max(
                ANALYTICS_POLICY.flushIntervalMs,
                this.retryAt - Date.now(),
            ),
        )
        this.timer.unref()
    }

    // HTTP 연결 정리가 끝난 뒤 큐를 비워, 처리 중이던 요청의 마지막 이벤트도 수집한다.
    async onApplicationShutdown(): Promise<void> {
        this.closing = true
        clearTimeout(this.timer)
        const deadline = setTimeout(
            () => this.shutdown.abort(),
            ANALYTICS_POLICY.shutdownTimeoutMs,
        )
        try {
            await this.flush()
            if (this.queue.size && !this.shutdown.signal.aborted)
                await this.flush()
        } finally {
            clearTimeout(deadline)
            this.transport.close()
            if (this.queue.size)
                this.logger.warn(
                    `Analytics shutdown: ${this.queue.size} unsent records lost from memory queue`,
                )
        }
    }
}
