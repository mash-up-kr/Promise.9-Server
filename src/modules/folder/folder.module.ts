import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'
import { AuthModule } from '../auth/auth.module'
import { LinkModule } from '../link/link.module'

import { FolderController } from './folder.controller'
import { FolderRepository } from './folder.repository'
import { FolderService } from './folder.service'
import { SharedFolderController } from './shared-folder.controller'

@Module({
    imports: [DatabaseModule, LinkModule, AuthModule],
    controllers: [FolderController, SharedFolderController],
    providers: [FolderService, FolderRepository],
})
export class FolderModule {}
