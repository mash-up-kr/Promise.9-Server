import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

import { FOLDER_NAME_MAX_LENGTH } from '../folder.constants'

export const createFolderSchema = z.object({
    folderName: z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH),
})
export type CreateFolderInput = z.infer<typeof createFolderSchema>

export const updateFolderSchema = z.object({
    folderName: z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH),
})
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>

// Swagger 문서용 (런타임 검증은 위의 zod 스키마가 담당)
export class CreateFolderDto {
    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string
}

export class UpdateFolderDto {
    @ApiProperty({ example: '읽을거리', description: '변경할 폴더 이름' })
    folderName!: string
}
