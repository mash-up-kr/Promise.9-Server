import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { z } from 'zod'

import {
    DEFAULT_PAGINATION_LIMIT,
    MAX_PAGINATION_LIMIT,
} from '../../../common/pagination/pagination.constants'
import { LINK_MEMO_MAX_LENGTH } from '../link.constants'

const booleanQuerySchema = z.preprocess((value) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
}, z.boolean())

// 링크 저장 전 OG 미리보기 조회용 쿼리 (url 하나)
export const linkPreviewQuerySchema = z.object({
    url: z.url(),
})
export type LinkPreviewQueryInput = z.infer<typeof linkPreviewQuerySchema>

export const createLinkSchema = z.object({
    url: z.url(),
    folderId: z.number().int().positive().nullish(),
    memo: z.string().max(LINK_MEMO_MAX_LENGTH).nullish(),
})
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const updateLinkSchema = z
    .object({
        folderId: z.number().int().positive().nullish(),
        memo: z.string().max(LINK_MEMO_MAX_LENGTH).nullish(),
        isFavorite: z.boolean().optional(),
    })
    .refine(
        (value) =>
            value.folderId !== undefined ||
            value.memo !== undefined ||
            value.isFavorite !== undefined,
        {
            message: '변경할 필드가 최소 하나는 필요합니다.',
        },
    )
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>

export const listLinksQuerySchema = z
    .object({
        q: z.string().trim().min(1).optional(),
        // 쿼리스트링은 문자열로 들어오므로 숫자로 변환한다.
        folderId: z.coerce.number().int().positive().optional(),
        unassigned: booleanQuerySchema.optional().default(false),
        favorite: booleanQuerySchema.optional().default(false),
        deleted: booleanQuerySchema.optional().default(false),
        sortBy: z
            .enum(['savedAt', 'viewedAt', 'deletedAt'])
            .optional()
            .default('savedAt'),
        order: z.enum(['asc', 'desc']).optional().default('desc'),
        cursor: z.string().trim().min(1).optional(),
        limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(MAX_PAGINATION_LIMIT)
            .optional()
            .default(DEFAULT_PAGINATION_LIMIT),
    })
    .refine((value) => !(value.folderId && value.unassigned), {
        message: 'folderId와 unassigned=true는 함께 사용할 수 없습니다.',
    })
    .refine((value) => value.sortBy !== 'deletedAt' || value.deleted, {
        message: 'sortBy=deletedAt은 deleted=true일 때만 사용할 수 있습니다.',
    })
export type ListLinksQueryInput = z.infer<typeof listLinksQuerySchema>

// Swagger 문서용 (런타임 검증은 위의 zod 스키마가 담당)
export class CreateLinkDto {
    @ApiProperty({
        example: 'https://toss.tech/article/slug',
        description: '[필수] 저장할 URL',
    })
    url!: string

    @ApiPropertyOptional({
        example: 3,
        nullable: true,
        type: Number,
        description: '[선택] 저장할 폴더 ID (생략·null이면 미분류)',
    })
    folderId?: number | null

    @ApiPropertyOptional({
        example: '나중에 꼭 읽기',
        nullable: true,
        description: `[선택] 메모 (최대 ${LINK_MEMO_MAX_LENGTH}자, 생략·null 가능)`,
    })
    memo?: string | null
}

export class UpdateLinkDto {
    @ApiPropertyOptional({
        example: 5,
        nullable: true,
        type: Number,
        description: '[선택] 이동할 폴더 ID (null이면 미분류)',
    })
    folderId?: number | null

    @ApiPropertyOptional({
        example: '리팩토링 참고 자료',
        nullable: true,
        description: `[선택] 메모 (최대 ${LINK_MEMO_MAX_LENGTH}자, null이면 삭제)`,
    })
    memo?: string | null

    @ApiPropertyOptional({
        example: true,
        type: Boolean,
        description: '[선택] 즐겨찾기 설정(true) 또는 해제(false)',
    })
    isFavorite?: boolean
}
