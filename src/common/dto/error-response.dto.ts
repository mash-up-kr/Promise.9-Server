import { ApiProperty } from '@nestjs/swagger'

import type { ErrorData, ErrorResponse } from '../exception/base.exception'

const ERROR_TIMESTAMP_EXAMPLE = '2026-07-13T09:41:00.000Z'

export class ErrorDataDto implements ErrorData {
    @ApiProperty({ example: 400, description: 'HTTP 상태 코드' })
    code!: number

    @ApiProperty({
        type: Number,
        example: 910001,
        description: '클라이언트 분기 처리용 애플리케이션 에러 코드',
    })
    errorCode!: number

    @ApiProperty({
        example: '요청 값이 올바르지 않습니다.',
        description: '사용자 또는 개발자에게 전달할 에러 메시지',
    })
    message!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: ERROR_TIMESTAMP_EXAMPLE,
        description: '에러 발생 시각 (ISO 8601)',
    })
    timestamp!: string
}

export class ErrorResponseDto implements ErrorResponse {
    @ApiProperty({
        example: false,
        description: '요청 실패 여부. 에러 응답에서는 항상 false',
    })
    success!: boolean

    @ApiProperty({ type: ErrorDataDto, description: '에러 상세 정보' })
    error!: ErrorDataDto
}
