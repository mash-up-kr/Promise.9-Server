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
    SearchLinkInput,
    searchLinkSchema,
    UpdateLinkInput,
    updateLinkSchema,
} from './dto/link.dto'
import { LinkService } from './link.service'
import {
    ApiCreateLink,
    ApiLinkDetail,
    ApiRemoveLink,
    ApiRestoreLink,
    ApiSearchLinks,
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

    // 정적 경로(:linkId 보다 먼저 선언) — /links/search
    @Get('search')
    @ApiSearchLinks()
    search(
        @CurrentUser() user: AuthUser,
        @Query(new ZodValidationPipe(searchLinkSchema)) query: SearchLinkInput,
    ) {
        return this.linkService.search(user.userId, query)
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
}
