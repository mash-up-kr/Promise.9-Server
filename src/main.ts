import { NestFactory } from '@nestjs/core'

import { CommonResponseInterceptor } from './common/interceptor/response.interceptor'
import { swaggerConfig } from './config/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    swaggerConfig(app)
    app.useGlobalInterceptors(new CommonResponseInterceptor())

    await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
