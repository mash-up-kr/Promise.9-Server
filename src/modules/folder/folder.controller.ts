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
    UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
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
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FolderController {
    constructor(private readonly folderService: FolderService) {}

    @Get()
    @ApiListFolders()
    list(@CurrentUser() user: AuthUser) {
        return this.folderService.list(user.userId)
    }

    @Post()
    @HttpCode(201)
    @ApiCreateFolder()
    create(
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createFolderSchema))
        body: CreateFolderInput,
    ) {
        return this.folderService.create(user.userId, body)
    }

    @Patch(':folderId')
    @ApiRenameFolder()
    rename(
        @CurrentUser() user: AuthUser,
        @Param('folderId', ParseIntPipe) folderId: number,
        @Body(new ZodValidationPipe(updateFolderSchema))
        body: UpdateFolderInput,
    ) {
        return this.folderService.rename(user.userId, folderId, body)
    }

    @Delete(':folderId')
    @HttpCode(204)
    @ApiRemoveFolder()
    remove(
        @CurrentUser() user: AuthUser,
        @Param('folderId', ParseIntPipe) folderId: number,
    ) {
        return this.folderService.remove(user.userId, folderId)
    }

    @Get(':folderId/links')
    @ApiGetFolderLinks()
    getLinks(
        @CurrentUser() user: AuthUser,
        @Param('folderId', ParseIntPipe) folderId: number,
    ) {
        return this.folderService.getLinks(user.userId, folderId)
    }
}
