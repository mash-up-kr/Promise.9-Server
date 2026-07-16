import { applyDecorators } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'

import { ApiCommonResponse } from '../../common/swagger/api-response.decorator'

import { MeResponseDto } from './dto/user.response.dto'

export const ApiGetMe = () =>
    applyDecorators(
        ApiOperation({ summary: '내 정보 조회' }),
        ApiCommonResponse(MeResponseDto, { description: '조회 성공' }),
    )
