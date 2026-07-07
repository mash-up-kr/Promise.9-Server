import {
    Body,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    LogoutDto,
    LogoutInput,
    logoutSchema,
    RefreshDto,
    RefreshInput,
    refreshSchema,
    SocialLoginDto,
    SocialLoginInput,
    socialLoginSchema,
    WithdrawDto,
    WithdrawInput,
    withdrawSchema,
} from './dto/auth.dto'
import { AuthService } from './auth.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('social')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '소셜 로그인' })
    @ApiBody({ type: SocialLoginDto })
    async socialLogin(
        @Body(new ZodValidationPipe(socialLoginSchema)) dto: SocialLoginInput,
    ) {
        return this.authService.socialLogin(dto.provider, dto.idToken)
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '토큰 재발급' })
    @ApiBody({ type: RefreshDto })
    async refresh(
        @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput,
    ) {
        return this.authService.refresh(dto.refreshToken)
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '로그아웃' })
    @ApiBody({ type: LogoutDto })
    async logout(
        @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutInput,
    ): Promise<void> {
        await this.authService.logout(dto.refreshToken)
    }

    @Delete('withdraw')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '회원 탈퇴' })
    @ApiBody({ type: WithdrawDto })
    async withdraw(
        @Body(new ZodValidationPipe(withdrawSchema)) dto: WithdrawInput,
    ): Promise<void> {
        await this.authService.withdraw(dto.refreshToken)
    }
}
