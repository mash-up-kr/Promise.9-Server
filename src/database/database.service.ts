import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { ValidatedEnvironment } from '../config/environment'

import * as schema from './schema'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseService.name)
    private readonly client: ReturnType<typeof postgres>

    readonly db: PostgresJsDatabase<typeof schema>

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.client = postgres(
            config.getOrThrow('DATABASE_URL', { infer: true }),
            {
                max: config.get('DB_POOL_SIZE', { infer: true }),
            },
        )

        this.db = drizzle(this.client, {
            schema,
            casing: 'snake_case',
        })
    }

    async onModuleInit() {
        try {
            await this.client`select 1`
            this.logger.log('Database connection established.')
        } catch (error) {
            this.logger.error('Failed to connect to the database.')
            throw error
        }
    }

    async onModuleDestroy() {
        await this.client.end()
    }
}
