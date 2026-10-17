// production과 같은 CommonJS 모듈 로딩 순서를 검증한다. 운영 API/DB를 사용하지 않는다.
require('../../dist/instrumentation')
const {
    Controller,
    Get,
    Logger,
    Module,
    Param,
    BadRequestException,
} = require('@nestjs/common')
const { NestFactory } = require('@nestjs/core')
const {
    TelemetryLogger,
} = require('../../dist/infrastructure/observability/telemetry.logger')
const {
    ObservabilityModule,
} = require('../../dist/infrastructure/observability/observability.module')
const {
    httpLoggerMiddleware,
} = require('../../dist/common/middleware/http-logger.middleware')
const {
    GlobalExceptionFilter,
} = require('../../dist/common/filters/global-exception.filter')
const { BaseException } = require('../../dist/common/exception/base.exception')

class FixtureController {
    async item(id) {
        await new Promise((resolve) =>
            setTimeout(resolve, id === '42' ? 25 : 5),
        )
        new Logger('Fixture').log({ event: 'fixture.item', marker: id })
        return { id }
    }
    boom() {
        throw new Error(
            'upstream failed https://remote.test/resource?token=error-secret mail@example.test',
        )
    }
    expected() {
        throw new BaseException({
            code: 409,
            errorCode: 123456,
            message: '이미 저장한 링크입니다.',
            data: { existingLinkId: 7 },
        })
    }
    bad() {
        throw new BadRequestException(['필수 필드가 없습니다.'])
    }
    health() {
        return 'ok'
    }
    async slow() {
        new Logger('Fixture').log({ event: 'fixture.slow.started' })
        await new Promise((resolve) => setTimeout(resolve, 250))
        return 'done'
    }
    async outbound() {
        const result = await fetch(
            `${process.env.OBS_TEST_UPSTREAM_URL}/resource?api_key=outbound-secret`,
        )
        return { status: result.status }
    }
}
Controller()(FixtureController)
for (const [name, path] of Object.entries({
    item: 'items/:id',
    boom: 'boom',
    expected: 'expected',
    bad: 'bad',
    health: '',
    outbound: 'outbound',
    slow: 'slow',
})) {
    Get(path)(
        FixtureController.prototype,
        name,
        Object.getOwnPropertyDescriptor(FixtureController.prototype, name),
    )
}
Param('id')(FixtureController.prototype, 'item', 0)
class FixtureModule {}
Module({ imports: [ObservabilityModule], controllers: [FixtureController] })(
    FixtureModule,
)

async function run() {
    const app = await NestFactory.create(FixtureModule, {
        logger: new TelemetryLogger('debug'),
        abortOnError: false,
    })
    app.use(httpLoggerMiddleware)
    app.useGlobalFilters(new GlobalExceptionFilter())
    app.setGlobalPrefix('api/v1')
    app.enableShutdownHooks()
    await app.listen(0, '127.0.0.1')
    process.send({ port: app.getHttpServer().address().port })
}
run().catch((error) => {
    process.stderr.write(String(error))
    process.exitCode = 1
})
