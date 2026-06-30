import { Module } from '@nestjs/common'

import { UrlSecurityService } from './url-security.service'

@Module({
    providers: [UrlSecurityService],
    exports: [UrlSecurityService],
})
export class UrlSecurityModule {}
