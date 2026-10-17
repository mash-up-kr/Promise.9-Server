import { FIREHOSE_LIMITS } from './analytics.constants'
import { AnalyticsQueue, QueuedEvent } from './analytics.queue'

const event = (size = 1): QueuedEvent => ({
    eventId: 'same-id',
    data: Buffer.alloc(size),
})

describe('AnalyticsQueue', () => {
    it('개수와 바이트 경계에서 수락하고 초과 이벤트만 거부한다', () => {
        const countLimited = new AnalyticsQueue({
            maxRecords: 2,
            maxBytes: 100,
        })
        expect(countLimited.enqueue(event())).toBe(true)
        expect(countLimited.enqueue(event())).toBe(true)
        expect(countLimited.enqueue(event())).toBe(false)
        const byteLimited = new AnalyticsQueue({ maxRecords: 100, maxBytes: 5 })
        expect(byteLimited.enqueue(event(5))).toBe(true)
        expect(byteLimited.enqueue(event())).toBe(false)
    })

    it('진행 중 배치도 용량에 포함하고 성공한 항목만 제거한다', () => {
        const queue = new AnalyticsQueue({ maxRecords: 3, maxBytes: 9 })
        const first = event(3),
            failed = event(3),
            added = event(3)
        queue.enqueue(first)
        queue.enqueue(failed)
        const batch = queue.peekBatch()
        queue.enqueue(added)
        expect(queue.enqueue(event())).toBe(false)
        queue.acknowledge(batch, [1])
        expect(queue.peekBatch()).toEqual([failed, added])
        expect(queue.enqueue(event(3))).toBe(true)
        expect(queue.enqueue(event())).toBe(false)
    })

    it('전체 실패는 큐 순서와 용량을 유지한다', () => {
        const queue = new AnalyticsQueue({ maxRecords: 2, maxBytes: 2 })
        queue.enqueue(event())
        queue.enqueue(event())
        const batch = queue.peekBatch()
        queue.acknowledge(batch, [0, 1])
        expect(queue.peekBatch()).toEqual(batch)
        expect(queue.enqueue(event())).toBe(false)
    })

    it('Firehose의 개수와 바이트 제한에 맞춰 배치를 자른다', () => {
        const queue = new AnalyticsQueue()
        for (let i = 0; i < 501; i++) queue.enqueue(event())
        expect(queue.peekBatch()).toHaveLength(500)
        const largeQueue = new AnalyticsQueue()
        for (let i = 0; i < 4; i++)
            largeQueue.enqueue(event(FIREHOSE_LIMITS.maxRecordBytes))
        expect(largeQueue.peekBatch()).toHaveLength(3)
    })
})
