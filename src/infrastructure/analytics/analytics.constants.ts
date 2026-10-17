export const ANALYTICS_POLICY = {
    flushIntervalMs: 5_000,
    flushThreshold: 100,
    // 전송 지연 시 큐가 무한히 쌓이지 않도록 정한 운영 정책: 최대 10,000건.
    maxQueueRecords: 10_000,
    // 이벤트 크기가 달라도 메모리 사용을 제한하도록 직렬화 데이터 합계를 16 MiB로 제한한다.
    // 이벤트 객체·배열 등의 메모리 오버헤드는 이 용량에 포함하지 않는다.
    maxQueueBytes: 16 * 1024 * 1024,
    requestTimeoutMs: 5_000,
    shutdownTimeoutMs: 15_000,
} as const

export const FIREHOSE_LIMITS = {
    // Firehose 단일 레코드 제한: Base64 인코딩 전 최대 1,000 KiB.
    maxRecordBytes: 1_000 * 1024,
    // PutRecordBatch가 한 요청에서 허용하는 최대 레코드 수.
    maxBatchRecords: 500,
    // base64 인코딩과 요청 메타데이터를 포함해 4 MiB보다 작게 유지한다.
    maxBatchBytes: 3 * 1024 * 1024 - 64 * 1024,
} as const
