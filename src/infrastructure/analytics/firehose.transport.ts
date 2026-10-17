import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose'

import { ValidatedEnvironment } from '../../config/environment'

import { FIREHOSE_LIMITS } from './analytics.constants'

@Injectable()
export class FirehoseTransport {
    private readonly client: FirehoseClient
    private readonly streamName: string | undefined

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.streamName = config.get('ANALYTICS_FIREHOSE_STREAM_NAME', {
            infer: true,
        })
        this.client = new FirehoseClient({
            region: config.get('AWS_REGION', { infer: true }),
            maxAttempts: 3,
        })
    }

    /** 실패했거나 성공 여부가 불명확한 레코드의 인덱스만 반환한다. */
    async sendBatch(records: Buffer[], signal: AbortSignal): Promise<number[]> {
        if (!this.streamName)
            throw new Error('Analytics stream is not configured')
        if (records.length === 0) return []
        if (
            records.length > FIREHOSE_LIMITS.maxBatchRecords ||
            records.some(
                (record) => record.length > FIREHOSE_LIMITS.maxRecordBytes,
            ) ||
            records.reduce((bytes, record) => bytes + record.length, 0) >
                FIREHOSE_LIMITS.maxBatchBytes
        )
            throw new Error('Analytics batch exceeds Firehose limits')

        const response = await this.client.send(
            new PutRecordBatchCommand({
                DeliveryStreamName: this.streamName,
                Records: records.map((Data) => ({ Data })),
            }),
            { abortSignal: signal },
        )
        return records.flatMap((_, index) => {
            const entry = response.RequestResponses?.[index]
            return entry?.RecordId && !entry.ErrorCode ? [] : [index]
        })
    }

    close(): void {
        this.client.destroy()
    }
}
