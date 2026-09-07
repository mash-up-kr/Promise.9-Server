import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateWorkerEnvironment } from './config/environment'
import { LinkAnalysisModule } from './modules/link/analysis/link-analysis.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateWorkerEnvironment,
        }),
        LinkAnalysisModule,
    ],
})
export class WorkerModule {}
