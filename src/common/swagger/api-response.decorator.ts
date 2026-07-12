import { applyDecorators, Type } from '@nestjs/common'
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger'

// 성공 응답을 공통 envelope(`{ success: true, data }`)로 감싸 문서화한다.
// CommonResponseInterceptor가 실제로 씌우는 포맷과 동일하게 맞춘다.
export const ApiCommonResponse = <TModel extends Type<unknown>>(
    dataDto: TModel,
    options: { status?: number; description?: string; isArray?: boolean } = {},
) => {
    const { status = 200, description, isArray = false } = options
    const dataSchema = isArray
        ? { type: 'array', items: { $ref: getSchemaPath(dataDto) } }
        : { $ref: getSchemaPath(dataDto) }

    return applyDecorators(
        ApiExtraModels(dataDto),
        ApiResponse({
            status,
            description,
            schema: {
                properties: {
                    success: { type: 'boolean', example: true },
                    data: dataSchema,
                },
            },
        }),
    )
}
