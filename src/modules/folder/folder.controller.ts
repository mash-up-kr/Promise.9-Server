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
import { ApiTags } from '@nestjs/swagger'

import { DEV_USER_ID } from '../../common/constants/dev-user'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    CreateFolderInput,
    createFolderSchema,
    UpdateFolderInput,
    updateFolderSchema,
} from './dto/folder.dto'
import { FolderService } from './folder.service'
import {
    ApiCreateFolder,
    ApiGetFolderLinks,
    ApiListFolders,
    ApiRemoveFolder,
    ApiRenameFolder,
} from './folder.swagger'

@ApiTags('Folder')
@Controller('folders')
export class FolderController {
    constructor(private readonly folderService: FolderService) {}

    @Get()
    @ApiListFolders()
    list() {
        return this.folderService.list(DEV_USER_ID)
    }

    @Post()
    @HttpCode(201)
    @ApiCreateFolder()
    create(
        @Body(new ZodValidationPipe(createFolderSchema))
        body: CreateFolderInput,
    ) {
        return this.folderService.create(DEV_USER_ID, body)
    }

    @Patch(':folderId')
    @ApiRenameFolder()
    rename(
        @Param('folderId', ParseIntPipe) folderId: number,
        @Body(new ZodValidationPipe(updateFolderSchema))
        body: UpdateFolderInput,
    ) {
        return this.folderService.rename(DEV_USER_ID, folderId, body)
    }

    @Delete(':folderId')
    @HttpCode(204)
    @ApiRemoveFolder()
    remove(@Param('folderId', ParseIntPipe) folderId: number) {
        return this.folderService.remove(DEV_USER_ID, folderId)
    }

    @Get(':folderId/links')
    @ApiGetFolderLinks()
    getLinks(@Param('folderId', ParseIntPipe) folderId: number) {
        return this.folderService.getLinks(DEV_USER_ID, folderId)
    }
}
