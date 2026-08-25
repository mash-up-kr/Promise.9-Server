import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ZodValidationPipe } from '../../common/pipe/zod-validation.pipe'

import {
    RecommendationQueryInput,
    recommendationQuerySchema,
} from './dto/recommendation.dto'
import { RecommendationService } from './recommendation.service'
import { ApiListRecommendations } from './recommendation.swagger'

@ApiTags('Recommendation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationController {
    constructor(
        private readonly recommendationService: RecommendationService,
    ) {}

    @Get()
    @ApiListRecommendations()
    list(
        @CurrentUser() user: AuthUser,
        @Query(new ZodValidationPipe(recommendationQuerySchema))
        query: RecommendationQueryInput,
    ) {
        return this.recommendationService.list(user.userId, query)
    }
}
