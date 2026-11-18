import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    SharedFolderQueryInput,
    sharedFolderQuerySchema,
} from './dto/folder.dto'
import { FolderService } from './folder.service'
import { ApiGetSharedFolder } from './folder.share.swagger'

// 로그인 없이 열리는 읽기 전용 경로. 공유 토큰을 아는 사람만 폴더를 읽는다.
@ApiTags('Folder')
@Controller('shared-folders')
export class SharedFolderController {
    constructor(private readonly folderService: FolderService) {}

    @Get(':shareToken')
    @ApiGetSharedFolder()
    get(
        @Param('shareToken') shareToken: string,
        @Query(new ZodValidationPipe(sharedFolderQuerySchema))
        query: SharedFolderQueryInput,
    ) {
        return this.folderService.getShared(shareToken, query)
    }
}
