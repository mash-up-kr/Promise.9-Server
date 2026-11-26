import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Put,
    UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { ZodValidationPipe } from '../../../common/pipe/zod-validation.pipe'

import { PushTokenService } from './push-token.service'
import { ApiRegisterPushToken } from './push-token.swagger'
import {
    RegisterPushTokenInput,
    registerPushTokenSchema,
} from './push-token.type'

@ApiTags('Push Token')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/push-tokens')
export class PushTokenController {
    constructor(private readonly pushTokenService: PushTokenService) {}

    /** 앱에서 발급한 토큰을 인증된 사용자에게 연결한다. */
    @Put()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiRegisterPushToken()
    register(
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(registerPushTokenSchema))
        input: RegisterPushTokenInput,
    ) {
        return this.pushTokenService.register(user.userId, input)
    }
}
