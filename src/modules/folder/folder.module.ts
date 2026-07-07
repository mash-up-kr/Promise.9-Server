import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'

import { FolderController } from './folder.controller'
import { FolderService } from './folder.service'

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [FolderController],
    providers: [FolderService],
})
export class FolderModule {}
