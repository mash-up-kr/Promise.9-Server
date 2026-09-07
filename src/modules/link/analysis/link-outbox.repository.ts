import { Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'

import {
    linkAnalysisOutbox as outbox,
    linkProcessingJobs as jobs,
} from './link-job.schema'

@Injectable()
export class LinkOutboxRepository {
    constructor(private readonly database: DatabaseService) {}
    // 앞선 작업이 끝나기 전에는 후속 메시지를 발행하지 않아 대기만으로 DLQ에 빠지는 것을 막는다.
    async publishOne(send: (jobId: number) => Promise<void>): Promise<boolean> {
        return this.database.db.transaction(async (tx) => {
            const [event] = await tx
                .select({ id: outbox.id, jobId: outbox.jobId })
                .from(outbox)
                .innerJoin(jobs, eq(jobs.id, outbox.jobId))
                .where(
                    and(
                        isNull(outbox.publishedAt),
                        sql`${outbox.availableAt} <= clock_timestamp()`,
                        sql`not exists (select 1 from link_processing_jobs preceding where preceding.link_id = ${jobs.linkId} and preceding.id < ${jobs.id} and preceding.status in ('PENDING', 'RUNNING'))`,
                    ),
                )
                .orderBy(asc(outbox.id))
                .limit(1)
                .for('update', { of: outbox, skipLocked: true })
            if (!event) return false
            await send(event.jobId)
            await tx
                .update(outbox)
                .set({ publishedAt: sql`clock_timestamp()` })
                .where(eq(outbox.id, event.id))
            return true
        })
    }
}
