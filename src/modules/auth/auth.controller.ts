import {
    Body,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
    LogoutDto,
    RefreshDto,
    SocialLoginDto,
    WithdrawDto,
} from './dto/auth.dto'
import { AuthService } from './auth.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('social')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '소셜 로그인' })
    async socialLogin(@Body() dto: SocialLoginDto) {
        return this.authService.socialLogin(dto.provider, dto.idToken)
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '토큰 재발급' })
    async refresh(@Body() dto: RefreshDto) {
        return this.authService.refresh(dto.refreshToken)
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '로그아웃' })
    async logout(@Body() dto: LogoutDto): Promise<void> {
        await this.authService.logout(dto.refreshToken)
    }

    @Delete('withdraw')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '회원 탈퇴' })
    async withdraw(@Body() dto: WithdrawDto): Promise<void> {
        await this.authService.withdraw(dto.refreshToken)
    }
}
