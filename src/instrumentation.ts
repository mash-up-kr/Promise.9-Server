import { writeSync } from 'node:fs'

import { config } from 'dotenv'

import { sanitizeLogValue } from './common/logging/redaction'
import { readObservabilityConfig } from './config/observability.config'
import { startTelemetry } from './infrastructure/observability/telemetry'

export const observabilityConfig = initializeTelemetry()

function initializeTelemetry() {
    try {
        // Nest ConfigModule보다 먼저 .env를 읽는다. Docker/CI 환경변수는 덮어쓰지 않는다.
        config({ quiet: true })
        const settings = readObservabilityConfig()
        startTelemetry(settings)
        return settings
    } catch (error: unknown) {
        // SDK 초기화 전에는 Nest Logger를 로드하지 않고 로컬 JSON 로그만 남긴다.
        writeSync(
            process.stderr.fd,
            `${JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'fatal',
                context: 'Bootstrap',
                event: 'application.start_failed',
                error: sanitizeLogValue(error),
            })}\n`,
        )
        process.exit(1)
    }
}
