import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import { UserService } from './user.service'
import { ApiGetMe, ApiSyncAttribution } from './user.swagger'
import { MarketingTouch, marketingTouchSchema } from './user-attribution'

@ApiTags('User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get('me')
    @ApiGetMe()
    async getMe(@CurrentUser() user: AuthUser) {
        return this.userService.getMe(user.userId)
    }

    @Patch('me/attribution')
    @ApiSyncAttribution()
    syncAttribution(
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(marketingTouchSchema))
        touch: MarketingTouch,
    ) {
        return this.userService.syncAttribution(user.userId, touch)
    }
}
