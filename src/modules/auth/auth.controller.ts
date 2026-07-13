import {
    Body,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    LogoutInput,
    logoutSchema,
    RefreshInput,
    refreshSchema,
    SocialLoginInput,
    socialLoginSchema,
    WithdrawInput,
    withdrawSchema,
} from './dto/auth.dto'
import { AuthService } from './auth.service'
import {
    ApiLogout,
    ApiRefreshToken,
    ApiSocialLogin,
    ApiWithdraw,
} from './auth.swagger'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('social')
    @HttpCode(HttpStatus.OK)
    @ApiSocialLogin()
    async socialLogin(
        @Body(new ZodValidationPipe(socialLoginSchema)) dto: SocialLoginInput,
    ) {
        return this.authService.socialLogin(dto.provider, dto.idToken)
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiRefreshToken()
    async refresh(
        @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput,
    ) {
        return this.authService.refresh(dto.refreshToken)
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiLogout()
    async logout(
        @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutInput,
    ): Promise<void> {
        await this.authService.logout(dto.refreshToken)
    }

    @Delete('withdraw')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiWithdraw()
    async withdraw(
        @Body(new ZodValidationPipe(withdrawSchema)) dto: WithdrawInput,
    ): Promise<void> {
        await this.authService.withdraw(dto.refreshToken)
    }
}
