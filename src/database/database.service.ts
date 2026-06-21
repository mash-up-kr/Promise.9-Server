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
            // TypeScript의 camelCase 필드를 PostgreSQL의 snake_case 컬럼으로 매핑
            casing: 'snake_case',
        })
    }

    async onModuleInit() {
        try {
            await this.client`select 1`
            this.logger.log('데이터베이스 연결이 완료되었습니다.')
        } catch (error) {
            this.logger.error('데이터베이스 연결에 실패했습니다.')
            throw error
        }
    }

    async onModuleDestroy() {
        await this.client.end()
    }
}
