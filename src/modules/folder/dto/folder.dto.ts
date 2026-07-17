import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

import { MAX_PAGINATION_LIMIT } from '../../../common/pagination/pagination.constants'
import {
    FOLDER_NAME_MAX_LENGTH,
    RESERVED_FOLDER_NAMES,
} from '../folder.constants'

// 폴더 이름 공통 검증: 트림 후 길이 제한 + 예약어 금지
const folderNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(FOLDER_NAME_MAX_LENGTH)
    .refine((name) => !RESERVED_FOLDER_NAMES.includes(name), {
        message: '사용할 수 없는 폴더 이름입니다.',
    })

export const createFolderSchema = z.object({
    folderName: folderNameSchema,
})
export type CreateFolderInput = z.infer<typeof createFolderSchema>

export const updateFolderSchema = z.object({
    folderName: folderNameSchema,
})
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>

export const listFoldersQuerySchema = z.object({
    sortBy: z
        .enum(['createdAt', 'updatedAt', 'lastSavedAt'])
        .optional()
        .default('updatedAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    limit: z.coerce.number().int().min(1).max(MAX_PAGINATION_LIMIT).optional(),
})
export type ListFoldersQueryInput = z.infer<typeof listFoldersQuerySchema>

// Swagger 문서용 (런타임 검증은 위의 zod 스키마가 담당)
export class CreateFolderDto {
    @ApiProperty({ example: '개발 블로그', description: '[필수] 폴더 이름' })
    folderName!: string
}

export class UpdateFolderDto {
    @ApiProperty({
        example: '읽을거리',
        description: '[필수] 수정할 폴더 이름. 현재 지원하는 유일한 수정 필드',
    })
    folderName!: string
}
