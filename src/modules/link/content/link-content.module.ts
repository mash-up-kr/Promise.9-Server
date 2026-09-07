import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../../../common/security/url-security/url-security.module'

import { LinkContentHtmlFetcher } from './html/link-content-html.fetcher'
import { TinyFishFetchClient } from './tinyfish/tinyfish-fetch.client'
import { LinkContentService } from './link-content.service'

@Module({
    imports: [UrlSecurityModule],
    providers: [
        LinkContentHtmlFetcher,
        LinkContentService,
        TinyFishFetchClient,
    ],
    exports: [LinkContentService],
})
export class LinkContentModule {}
