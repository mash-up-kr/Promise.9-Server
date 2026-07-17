import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

import { MAX_PAGINATION_LIMIT } from '../../../common/pagination/pagination.constants'
import {
    DEFAULT_FOLDER_COLOR,
    FOLDER_COLOR_SET,
    FOLDER_COLORS,
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

// 폴더 색상 공통 검증: 소문자로 정규화한 뒤 백엔드 팔레트에 있는 hex인지 확인
const folderColorSchema = z
    .string()
    .trim()
    .transform((color) => color.toLowerCase())
    .refine((color) => FOLDER_COLOR_SET.has(color), {
        message: '사용할 수 없는 폴더 색상입니다.',
    })

export const createFolderSchema = z.object({
    folderName: folderNameSchema,
    // 미지정 시 기본색(검정)으로 저장
    color: folderColorSchema.default(DEFAULT_FOLDER_COLOR),
})
export type CreateFolderInput = z.infer<typeof createFolderSchema>

// 이름·색상 중 넘어온 값만 부분 수정. 최소 하나는 있어야 한다.
export const updateFolderSchema = z
    .object({
        folderName: folderNameSchema.optional(),
        color: folderColorSchema.optional(),
    })
    .refine(
        (input) => input.folderName !== undefined || input.color !== undefined,
        { message: '변경할 이름 또는 색상을 입력해주세요.' },
    )
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

    @ApiProperty({
        required: false,
        enum: FOLDER_COLORS,
        default: DEFAULT_FOLDER_COLOR,
        description:
            '폴더 색상 hex (미지정 시 기본색). GET /folders/colors 목록 중 하나',
    })
    color?: string
}

export class UpdateFolderDto {
    @ApiProperty({
        required: false,
        example: '읽을거리',
        description: '변경할 폴더 이름',
    })
    folderName?: string

    @ApiProperty({
        required: false,
        enum: FOLDER_COLORS,
        description: '변경할 폴더 색상 hex. GET /folders/colors 목록 중 하나',
    })
    color?: string
}
