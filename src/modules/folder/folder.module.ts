import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'
import { LinkModule } from '../link/link.module'

import { FolderController } from './folder.controller'
import { FolderRepository } from './folder.repository'
import { FolderService } from './folder.service'

@Module({
    imports: [DatabaseModule, LinkModule, AuthModule],
    controllers: [FolderController],
    providers: [FolderService, FolderRepository],
})
export class FolderModule {}
