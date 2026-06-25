import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'

import { DEV_USER_ID } from '../../common/constants/dev-user'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    CreateLinkDto,
    CreateLinkInput,
    createLinkSchema,
    SearchLinkInput,
    searchLinkSchema,
    UpdateLinkDto,
    UpdateLinkInput,
    updateLinkSchema,
} from './dto/link.dto'
import { LinkService } from './link.service'

@ApiTags('Link')
@Controller('links')
export class LinkController {
    constructor(private readonly linkService: LinkService) {}

    @Post()
    @HttpCode(201)
    @ApiOperation({ summary: '링크 저장' })
    @ApiBody({ type: CreateLinkDto })
    create(
        @Body(new ZodValidationPipe(createLinkSchema)) body: CreateLinkInput,
    ) {
        return this.linkService.create(DEV_USER_ID, body)
    }

    // 정적 경로(:linkId 보다 먼저 선언) — /links/search
    @Get('search')
    @ApiOperation({ summary: '링크 검색 (제목·출처 기준)' })
    @ApiQuery({ name: 'q', required: true })
    @ApiQuery({ name: 'folderId', required: false })
    search(
        @Query(new ZodValidationPipe(searchLinkSchema)) query: SearchLinkInput,
    ) {
        return this.linkService.search(DEV_USER_ID, query)
    }

    @Get(':linkId')
    @ApiOperation({ summary: '링크 상세 조회' })
    detail(@Param('linkId', ParseUUIDPipe) linkId: string) {
        return this.linkService.detail(DEV_USER_ID, linkId)
    }

    @Patch(':linkId')
    @ApiOperation({ summary: '링크 수정 (폴더 변경 / 메모 수정)' })
    @ApiBody({ type: UpdateLinkDto })
    update(
        @Param('linkId', ParseUUIDPipe) linkId: string,
        @Body(new ZodValidationPipe(updateLinkSchema)) body: UpdateLinkInput,
    ) {
        return this.linkService.update(DEV_USER_ID, linkId, body)
    }

    @Delete(':linkId')
    @HttpCode(204)
    @ApiOperation({ summary: '링크 삭제 (최근 삭제된 항목으로 이동)' })
    remove(@Param('linkId', ParseUUIDPipe) linkId: string) {
        return this.linkService.remove(DEV_USER_ID, linkId)
    }

    @Post(':linkId/restore')
    @ApiOperation({ summary: '링크 복구 (미분류로 복원)' })
    restore(@Param('linkId', ParseUUIDPipe) linkId: string) {
        return this.linkService.restore(DEV_USER_ID, linkId)
    }
}
