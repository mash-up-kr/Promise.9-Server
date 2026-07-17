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
    Query,
    UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    CreateLinkInput,
    createLinkSchema,
    ListLinksQueryInput,
    listLinksQuerySchema,
    UpdateLinkInput,
    updateLinkSchema,
} from './dto/link.dto'
import { CreateLinkTagInput, createLinkTagSchema } from './dto/tag.dto'
import { LinkService } from './link.service'
import {
    ApiCreateLink,
    ApiCreateLinkTag,
    ApiLinkDetail,
    ApiListLinks,
    ApiMarkLinkViewed,
    ApiRemoveLink,
    ApiRemoveLinkTag,
    ApiRestoreLink,
    ApiUpdateLink,
} from './link.swagger'

@ApiTags('Link')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('links')
export class LinkController {
    constructor(private readonly linkService: LinkService) {}

    @Post()
    @HttpCode(201)
    @ApiCreateLink()
    create(
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createLinkSchema)) body: CreateLinkInput,
    ) {
        return this.linkService.create(user.userId, body)
    }

    @Get()
    @ApiListLinks()
    list(
        @CurrentUser() user: AuthUser,
        @Query(new ZodValidationPipe(listLinksQuerySchema))
        query: ListLinksQueryInput,
    ) {
        return this.linkService.list(user.userId, query)
    }

    @Get(':linkId')
    @ApiLinkDetail()
    detail(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
    ) {
        return this.linkService.detail(user.userId, linkId)
    }

    @Patch(':linkId')
    @ApiUpdateLink()
    update(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
        @Body(new ZodValidationPipe(updateLinkSchema)) body: UpdateLinkInput,
    ) {
        return this.linkService.update(user.userId, linkId, body)
    }

    @Delete(':linkId')
    @HttpCode(204)
    @ApiRemoveLink()
    remove(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
    ) {
        return this.linkService.remove(user.userId, linkId)
    }

    @Post(':linkId/restore')
    @ApiRestoreLink()
    restore(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
    ) {
        return this.linkService.restore(user.userId, linkId)
    }

    @Post(':linkId/view')
    @HttpCode(204)
    @ApiMarkLinkViewed()
    markViewed(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
    ) {
        return this.linkService.markViewed(user.userId, linkId)
    }

    @Post(':linkId/tags')
    @HttpCode(201)
    @ApiCreateLinkTag()
    createTag(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
        @Body(new ZodValidationPipe(createLinkTagSchema))
        body: CreateLinkTagInput,
    ) {
        return this.linkService.createTag(user.userId, linkId, body)
    }

    @Delete(':linkId/tags/:tagId')
    @HttpCode(204)
    @ApiRemoveLinkTag()
    removeTag(
        @CurrentUser() user: AuthUser,
        @Param('linkId', ParseIntPipe) linkId: number,
        @Param('tagId', ParseIntPipe) tagId: number,
    ) {
        return this.linkService.removeTag(user.userId, linkId, tagId)
    }
}
