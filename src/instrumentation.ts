import { config } from 'dotenv'

import { readObservabilityConfig } from './infrastructure/observability/observability.config'
import { startTelemetry } from './infrastructure/observability/telemetry'

// Nest ConfigModule보다 먼저 .env를 읽는다. Docker/CI 환경변수는 덮어쓰지 않는다.
config({ quiet: true })
export const observabilityConfig = readObservabilityConfig()
startTelemetry(observabilityConfig)
