import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

export const TAG_NAME_MAX_LENGTH = 20

export const createLinkTagSchema = z.object({
    name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH),
})
export type CreateLinkTagInput = z.infer<typeof createLinkTagSchema>

// ApiBody가 OpenAPI 요청 schema를 만들 때 사용하는 DTO다. 런타임 검증은 위 Zod schema가 담당한다.
// userId, linkId, normalizedName, sourceType은 인증 사용자·path parameter·서버 정책으로 결정하므로 body로 받지 않는다.
export class CreateLinkTagDto {
    @ApiProperty({
        example: '실험 설계',
        minLength: 1,
        maxLength: TAG_NAME_MAX_LENGTH,
        description: `[필수] 추가할 태그 이름 (공백 제거 후 1~${TAG_NAME_MAX_LENGTH}자)`,
    })
    name!: string
}
