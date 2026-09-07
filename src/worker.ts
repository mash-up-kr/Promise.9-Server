import { NestFactory } from '@nestjs/core'

import { WorkerModule } from './worker.module'

async function bootstrap() {
    const worker = await NestFactory.createApplicationContext(WorkerModule)
    worker.enableShutdownHooks()
}

void bootstrap()
