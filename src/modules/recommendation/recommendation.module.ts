import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { RecommendationController } from './recommendation.controller'
import { RecommendationRepository } from './recommendation.repository'
import { RecommendationService } from './recommendation.service'

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [RecommendationController],
    providers: [RecommendationService, RecommendationRepository],
})
export class RecommendationModule {}
