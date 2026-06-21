import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseService.name)
    private readonly pool: Pool

    readonly db: NodePgDatabase<typeof schema>

    constructor(config: ConfigService) {
        this.pool = new Pool({
            connectionString: config.getOrThrow<string>('DATABASE_URL'),
        })

        this.db = drizzle(this.pool, { schema })
    }

    async onModuleInit() {
        try {
            await this.pool.query('select 1')
            this.logger.log('Database connection established.')
        } catch (error) {
            this.logger.error('Failed to connect to the database.')
            throw error
        }
    }

    async onModuleDestroy() {
        await this.pool.end()
    }
}
