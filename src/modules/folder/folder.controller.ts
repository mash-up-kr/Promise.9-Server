import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'

import { DEV_USER_ID } from '../../common/constants/dev-user'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    CreateFolderDto,
    CreateFolderInput,
    createFolderSchema,
    UpdateFolderDto,
    UpdateFolderInput,
    updateFolderSchema,
} from './dto/folder.dto'
import { FolderService } from './folder.service'

@ApiTags('Folder')
@Controller('folders')
export class FolderController {
    constructor(private readonly folderService: FolderService) {}

    @Get()
    @ApiOperation({ summary: '폴더 목록 조회 (시스템 폴더 카운트 포함)' })
    list() {
        return this.folderService.list(DEV_USER_ID)
    }

    @Post()
    @HttpCode(201)
    @ApiOperation({ summary: '폴더 생성' })
    @ApiBody({ type: CreateFolderDto })
    create(
        @Body(new ZodValidationPipe(createFolderSchema))
        body: CreateFolderInput,
    ) {
        return this.folderService.create(DEV_USER_ID, body)
    }

    @Patch(':folderId')
    @ApiOperation({ summary: '폴더 이름 변경' })
    @ApiBody({ type: UpdateFolderDto })
    rename(
        @Param('folderId', ParseIntPipe) folderId: number,
        @Body(new ZodValidationPipe(updateFolderSchema))
        body: UpdateFolderInput,
    ) {
        return this.folderService.rename(DEV_USER_ID, folderId, body)
    }

    @Delete(':folderId')
    @HttpCode(204)
    @ApiOperation({
        summary: '폴더 삭제 (하위 링크는 최근 삭제된 항목으로 이동)',
    })
    remove(@Param('folderId', ParseIntPipe) folderId: number) {
        return this.folderService.remove(DEV_USER_ID, folderId)
    }

    @Get(':folderId/links')
    @ApiOperation({ summary: '폴더 내 링크 목록 조회' })
    getLinks(@Param('folderId', ParseIntPipe) folderId: number) {
        return this.folderService.getLinks(DEV_USER_ID, folderId)
    }
}
