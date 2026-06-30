import { Module } from '@nestjs/common'

import { UrlSecurityModule } from '../url-security/url-security.module'

import { NodeVibrantImageColorAnalyzer } from './analyzers/node-vibrant-image-color.analyzer'
import { SharpImageColorAnalyzer } from './analyzers/sharp-image-color.analyzer'
import { ImageFetcherService } from './image-fetcher/image-fetcher.service'
import { ImageResponseReader } from './image-fetcher/image-response.reader'
import { ImageColorService } from './image-color.service'

@Module({
    imports: [UrlSecurityModule],
    providers: [
        ImageFetcherService,
        ImageResponseReader,
        ImageColorService,
        NodeVibrantImageColorAnalyzer,
        SharpImageColorAnalyzer,
    ],
    exports: [ImageColorService],
})
export class ImageColorModule {}
