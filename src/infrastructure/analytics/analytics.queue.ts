import { ANALYTICS_POLICY, FIREHOSE_LIMITS } from './analytics.constants'

export type QueuedEvent = { eventId: string; data: Buffer }

/** 전송 중인 이벤트도 성공 확인 전까지 큐 용량에 포함한다. */
export class AnalyticsQueue {
    private events: QueuedEvent[] = []
    private bytes = 0

    constructor(
        private readonly limits: { maxRecords: number; maxBytes: number } = {
            maxRecords: ANALYTICS_POLICY.maxQueueRecords,
            maxBytes: ANALYTICS_POLICY.maxQueueBytes,
        },
    ) {}

    get size(): number {
        return this.events.length
    }

    enqueue(event: QueuedEvent): boolean {
        // 건수·바이트 중 하나라도 운영 한도를 넘으면 기존 대기 이벤트를 보존하고 새 이벤트를 거절한다.
        if (
            this.size >= this.limits.maxRecords ||
            this.bytes + event.data.length > this.limits.maxBytes
        )
            return false
        this.events.push(event)
        this.bytes += event.data.length
        return true
    }

    peekBatch(): QueuedEvent[] {
        const batch: QueuedEvent[] = []
        let bytes = 0
        for (const event of this.events) {
            if (
                batch.length === FIREHOSE_LIMITS.maxBatchRecords ||
                bytes + event.data.length > FIREHOSE_LIMITS.maxBatchBytes
            )
                break
            batch.push(event)
            bytes += event.data.length
        }
        return batch
    }

    /** 전송 도중 추가된 이벤트와 실패한 이벤트는 기존 순서대로 남긴다. */
    acknowledge(
        batch: readonly QueuedEvent[],
        failedIndices: readonly number[],
    ): void {
        const failed = new Set(failedIndices)
        const succeeded = new Set(
            batch.filter((_, index) => !failed.has(index)),
        )
        this.events = this.events.filter((event) => {
            if (!succeeded.has(event)) return true
            this.bytes -= event.data.length
            return false
        })
    }
}
