import { Global, Module } from '@nestjs/common'

import { SqsService } from './sqs.service'

@Global()
@Module({
    providers: [SqsService],
    exports: [SqsService],
})
export class SqsModule {}
