import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { CommonResponseInterceptor } from './common/interceptor/response.interceptor'
import { httpLoggerMiddleware } from './common/middleware/http-logger.middleware'
import { swaggerConfig } from './config/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    // 모든 요청의 url·status를 남기는 접근 로그 (라우팅 이전 단계에서 등록)
    app.use(httpLoggerMiddleware)

    app.enableCors({
        origin: ['http://localhost:8090', 'https://link-ding-dong.com'],
        credentials: true,
    })

    app.useGlobalFilters(new GlobalExceptionFilter())
    app.useGlobalInterceptors(new CommonResponseInterceptor())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
    app.setGlobalPrefix('api/v1')

    swaggerConfig(app)

    const port = process.env.PORT ?? 3000
    const serverHost = process.env.SERVER_HOST

    if (serverHost) {
        await app.listen(port, serverHost)
        return
    }

    await app.listen(port)
}
void bootstrap()
