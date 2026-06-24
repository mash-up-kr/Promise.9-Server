import { NestFactory } from '@nestjs/core'

import { swaggerConfig } from './config/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    swaggerConfig(app)

    await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
