import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../../common/exception/common-error-code.constant'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../../auth/auth-error.constant'
import { USER_ERROR } from '../user-error.constant'

import {
    NotificationSettingsResponseDto,
    UpdateNotificationSettingsDto,
} from './dto/notification-setting.dto'

export const ApiGetNotificationSettings = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 알림 수신 설정 조회',
            description:
                '리마인드 이메일·앱 푸시 수신 여부를 반환한다. 설정한 적 없는 채널은 true로 반환한다.',
        }),
        ApiCommonResponse(NotificationSettingsResponseDto, {
            description: '조회 성공',
            dataExample: { email: true, push: true },
        }),
        ApiCommonErrorResponses(AUTH_ERROR.INVALID_TOKEN, USER_ERROR.NOT_FOUND),
    )

export const ApiUpdateNotificationSettings = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 알림 수신 설정 변경',
            description:
                '보낸 채널만 변경하고 변경 후 전체 설정을 반환한다. 채널을 하나 이상 보내야 한다. 이미 잡힌 리마인드 일정은 바꾸지 않으며, 발송 시점에 켜진 채널로만 보낸다.',
        }),
        ApiBody({ type: UpdateNotificationSettingsDto }),
        ApiCommonResponse(NotificationSettingsResponseDto, {
            description: '변경 후 전체 설정',
            dataExample: { email: false, push: true },
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            USER_ERROR.NOT_FOUND,
        ),
    )
