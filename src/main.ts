import { NestFactory } from '@nestjs/core'

import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { CommonResponseInterceptor } from './common/interceptor/response.interceptor'
import { swaggerConfig } from './config/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    app.useGlobalFilters(new GlobalExceptionFilter())
    app.useGlobalInterceptors(new CommonResponseInterceptor())

    swaggerConfig(app)

    await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
