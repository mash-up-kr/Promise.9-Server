import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { ValidatedEnvironment } from '../environment'

import * as schema from './schema'

// drizzle 트랜잭션 콜백이 넘겨주는 tx 타입 (db와 동일한 쿼리 인터페이스)
export type Transaction = Parameters<
    Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]
>[0]

// repository 메서드가 일반 커넥션(db) 또는 트랜잭션(tx) 어느 쪽에서도 실행되게 하는 실행자 타입
export type DbExecutor = PostgresJsDatabase<typeof schema> | Transaction

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
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `데이터베이스 연결에 실패했습니다: ${errorMessage}`,
                errorStack,
            )
            throw error
        }
    }

    async onModuleDestroy() {
        await this.client.end()
    }
}
