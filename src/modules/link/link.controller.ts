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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { DEV_USER_ID } from '../../common/constants/dev-user'
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
@Controller('links')
export class LinkController {
    constructor(private readonly linkService: LinkService) {}

    @Post()
    @HttpCode(201)
    @ApiCreateLink()
    create(
        @Body(new ZodValidationPipe(createLinkSchema)) body: CreateLinkInput,
    ) {
        return this.linkService.create(DEV_USER_ID, body)
    }

    // 정적 경로(:linkId 보다 먼저 선언) — /links/search
    @Get('search')
    @ApiSearchLinks()
    search(
        @Query(new ZodValidationPipe(searchLinkSchema)) query: SearchLinkInput,
    ) {
        return this.linkService.search(DEV_USER_ID, query)
    }

    @Get(':linkId')
    @ApiLinkDetail()
    detail(@Param('linkId', ParseIntPipe) linkId: number) {
        return this.linkService.detail(DEV_USER_ID, linkId)
    }

    @Patch(':linkId')
    @ApiUpdateLink()
    update(
        @Param('linkId', ParseIntPipe) linkId: number,
        @Body(new ZodValidationPipe(updateLinkSchema)) body: UpdateLinkInput,
    ) {
        return this.linkService.update(DEV_USER_ID, linkId, body)
    }

    @Delete(':linkId')
    @HttpCode(204)
    @ApiRemoveLink()
    remove(@Param('linkId', ParseIntPipe) linkId: number) {
        return this.linkService.remove(DEV_USER_ID, linkId)
    }

    @Post(':linkId/restore')
    @ApiRestoreLink()
    restore(@Param('linkId', ParseIntPipe) linkId: number) {
        return this.linkService.restore(DEV_USER_ID, linkId)
    }
}
