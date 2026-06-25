import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { z } from 'zod'

import { LINK_MEMO_MAX_LENGTH } from '../link.constants'

export const createLinkSchema = z.object({
    url: z.url(),
    folderId: z.uuid().nullish(),
    memo: z.string().max(LINK_MEMO_MAX_LENGTH).nullish(),
})
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const updateLinkSchema = z
    .object({
        folderId: z.uuid().nullish(),
        memo: z.string().max(LINK_MEMO_MAX_LENGTH).nullish(),
    })
    .refine(
        (value) => value.folderId !== undefined || value.memo !== undefined,
        {
            message: '변경할 필드가 최소 하나는 필요합니다.',
        },
    )
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>

export const searchLinkSchema = z.object({
    q: z.string().trim().min(1),
    folderId: z.uuid().optional(),
})
export type SearchLinkInput = z.infer<typeof searchLinkSchema>

// Swagger 문서용 (런타임 검증은 위의 zod 스키마가 담당)
export class CreateLinkDto {
    @ApiProperty({
        example: 'https://toss.tech/article/slug',
        description: '저장할 URL',
    })
    url!: string

    @ApiPropertyOptional({
        nullable: true,
        description: '저장할 폴더 ID (없으면 미분류)',
    })
    folderId?: string | null

    @ApiPropertyOptional({ nullable: true, description: '메모' })
    memo?: string | null
}

export class UpdateLinkDto {
    @ApiPropertyOptional({
        nullable: true,
        description: '이동할 폴더 ID (null이면 미분류)',
    })
    folderId?: string | null

    @ApiPropertyOptional({ nullable: true, description: '메모' })
    memo?: string | null
}
