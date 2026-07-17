import { applyDecorators, HttpStatus, Type } from '@nestjs/common'
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger'

import { ErrorDataDto, ErrorResponseDto } from '../dto/error-response.dto'

export interface ApiErrorDefinition {
    code: HttpStatus
    errorCode: number
    message: string
}

const ERROR_TIMESTAMP_EXAMPLE = '2026-07-13T09:41:00.000Z'

// 성공 응답을 공통 envelope(`{ success: true, data }`)로 감싸 문서화한다.
// CommonResponseInterceptor가 실제로 씌우는 포맷과 동일하게 맞춘다.
export const ApiCommonResponse = <TModel extends Type<unknown>>(
    dataDto: TModel,
    options: {
        status?: number
        description?: string
        isArray?: boolean
        dataExample?: unknown
    } = {},
) => {
    const { status = 200, description, isArray = false, dataExample } = options
    const dataSchema = isArray
        ? { type: 'array', items: { $ref: getSchemaPath(dataDto) } }
        : { $ref: getSchemaPath(dataDto) }

    return applyDecorators(
        ApiExtraModels(dataDto),
        ApiResponse({
            status,
            description,
            schema: {
                type: 'object',
                required: ['success', 'data'],
                properties: {
                    success: { type: 'boolean', example: true },
                    data: dataSchema,
                },
                ...(dataExample === undefined
                    ? {}
                    : { example: { success: true, data: dataExample } }),
            },
        }),
    )
}

// 실제 서비스가 사용하는 에러 정의를 받아 HTTP status별로 묶는다.
// 같은 status에 여러 도메인 에러가 있으면 Swagger examples에서 각각 선택할 수 있다.
export const ApiCommonErrorResponses = (...errors: ApiErrorDefinition[]) => {
    const errorsByStatus = new Map<HttpStatus, ApiErrorDefinition[]>()

    for (const error of errors) {
        const statusErrors = errorsByStatus.get(error.code) ?? []
        statusErrors.push(error)
        errorsByStatus.set(error.code, statusErrors)
    }

    return applyDecorators(
        ApiExtraModels(ErrorResponseDto, ErrorDataDto),
        ...[...errorsByStatus.entries()].map(([status, statusErrors]) =>
            ApiResponse({
                status,
                description: `발생 가능한 errorCode: ${statusErrors
                    .map((error) => error.errorCode)
                    .join(', ')}`,
                content: {
                    'application/json': {
                        schema: { $ref: getSchemaPath(ErrorResponseDto) },
                        examples: Object.fromEntries(
                            statusErrors.map((error) => [
                                `errorCode_${error.errorCode}`,
                                {
                                    summary: `${error.errorCode} - ${error.message}`,
                                    value: {
                                        success: false,
                                        error: {
                                            code: status,
                                            errorCode: error.errorCode,
                                            message: error.message,
                                            timestamp: ERROR_TIMESTAMP_EXAMPLE,
                                        },
                                    },
                                },
                            ]),
                        ),
                    },
                },
            }),
        ),
    )
}
