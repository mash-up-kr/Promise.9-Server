import { TelemetryLogger } from './telemetry.logger'

export function registerFatalErrorHandler(logger: TelemetryLogger): void {
    // monitor만 쓰면 Node가 마스킹 전 예외를 stderr에 다시 출력한다.
    // 오류 이후 요청 처리를 재개하지 않고 동기 로그를 남긴 뒤 종료한다.
    process.once('uncaughtException', (error, origin) => {
        try {
            logger.fatal(
                { event: 'process.uncaught_exception', origin, error },
                'Bootstrap',
            )
        } finally {
            // 비정상 상태에서는 비동기 OTLP flush를 기다리지 않는다.
            process.exit(1)
        }
    })
}
