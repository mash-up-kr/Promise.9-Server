/* eslint-disable simple-import-sort/imports -- CommonJS에서 Nest/HTTP를 로드하기 전에 SDK를 시작해야 한다. */
import { observabilityConfig } from './instrumentation'

import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { CommonResponseInterceptor } from './common/interceptor/response.interceptor'
import { httpLoggerMiddleware } from './common/middleware/http-logger.middleware'
import { swaggerConfig } from './config/swagger'
import { registerFatalErrorHandler } from './infrastructure/observability/fatal-error-handler'
import { shutdownTelemetry } from './infrastructure/observability/telemetry'
import { TelemetryLogger } from './infrastructure/observability/telemetry.logger'

const logger = new TelemetryLogger(observabilityConfig.logLevel)
Logger.overrideLogger(logger)

registerFatalErrorHandler(logger)

async function bootstrap() {
    let app: INestApplication | undefined
    try {
        // 환경변수 검증/모듈 로딩 실패도 같은 JSON 로거로 처리한다.
        const { AppModule } = await import('./app.module')
        app = await NestFactory.create(AppModule, {
            logger,
            abortOnError: false,
        })
        app.use(httpLoggerMiddleware)
        app.enableCors({
            origin: [
                'http://localhost:8090',
                'https://link-ding-dong.com',
                'https://dev-promise9-web.2026promise-9.workers.dev',
                'https://promise9-ranking-lab.dltmdcks.chatgpt.site',
            ],
            credentials: true,
            exposedHeaders: ['x-request-id', 'x-trace-id'],
        })
        app.useGlobalFilters(new GlobalExceptionFilter())
        app.useGlobalInterceptors(new CommonResponseInterceptor())
        app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
        app.setGlobalPrefix('api/v1')
        app.enableShutdownHooks()
        swaggerConfig(app)

        const port = process.env.PORT ?? 3000
        const serverHost = process.env.SERVER_HOST
        if (serverHost) await app.listen(port, serverHost)
        else await app.listen(port)

        logger.log(
            {
                event: 'application.started',
                telemetry_enabled: observabilityConfig.enabled,
                environment: observabilityConfig.environment,
            },
            'Bootstrap',
        )
    } catch (error: unknown) {
        logger.fatal({ event: 'application.start_failed', error }, 'Bootstrap')
        await app
            ?.close()
            .catch((closeError: unknown) =>
                logger.error(
                    { event: 'application.close_failed', error: closeError },
                    'Bootstrap',
                ),
            )
        await shutdownTelemetry().catch(() => undefined)
        // create() 중 실패하면 app 참조 없이 열린 연결이 남을 수 있으므로 확실히 종료한다.
        process.exit(1)
    }
}
void bootstrap()
