import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../common/guards/jwt-auth.guard'

import { UserService } from './user.service'
import { ApiGetMe } from './user.swagger'

@ApiTags('users')
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiGetMe()
    async getMe(@CurrentUser() user: AuthUser) {
        return this.userService.getMe(user.userId)
    }
}
