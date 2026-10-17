import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common'
import { diag } from '@opentelemetry/api'

import { shutdownTelemetry } from './telemetry'

@Injectable()
class ObservabilityLifecycle implements OnApplicationShutdown {
    async onApplicationShutdown(): Promise<void> {
        // onModuleDestroy의 작업 drain과 HTTP 서버 종료 이후 마지막 배치를 전송한다.
        try {
            await shutdownTelemetry()
        } catch (error: unknown) {
            // 종료된 LoggerProvider로 다시 전송하지 않고 로컬 진단에만 기록한다.
            diag.error('telemetry.shutdown_failed', error)
        }
    }
}

@Module({ providers: [ObservabilityLifecycle] })
export class ObservabilityModule {}
