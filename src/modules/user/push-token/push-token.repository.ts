import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { BaseException } from '../../../common/exception/base.exception'
import { COMMON_ERROR } from '../../../common/exception/common-error-code.constant'
import {
    DatabaseService,
    DbExecutor,
    Transaction,
} from '../../../config/database/database.service'
import { pushTokens } from '../../notification/notification.schema'
import { users } from '../schema/user.schema'

import { RegisterPushTokenInput } from './push-token.type'

@Injectable()
export class PushTokenRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    /** 활성 회원에게 토큰을 등록·갱신한다. 계정이 없거나 탈퇴했다면 false를 반환한다. */
    register(userId: number, input: RegisterPushTokenInput): Promise<boolean> {
        return this.db
            .transaction(async (tx) => {
                if (!(await this.lockActiveUser(userId, tx))) return false

                await tx
                    .insert(pushTokens)
                    .values({
                        userId,
                        token: input.token,
                        platform: input.platform,
                    })
                    .onConflictDoUpdate({
                        target: pushTokens.token,
                        set: {
                            userId,
                            platform: input.platform,
                            updatedAt: new Date(),
                        },
                    })

                return true
            })
            .catch(() => {
                // Drizzle 오류에는 토큰을 포함한 SQL 파라미터가 들어갈 수 있다.
                throw new BaseException(COMMON_ERROR.INTERNAL_SERVER_ERROR)
            })
    }

    /** 로그아웃 재시도와 계정 전환을 고려해 현재 소유자의 해당 토큰만 삭제한다. */
    async deleteByUserAndToken(
        userId: number,
        token: string,
        executor: DbExecutor = this.db,
    ): Promise<void> {
        try {
            await executor
                .delete(pushTokens)
                .where(
                    and(
                        eq(pushTokens.userId, userId),
                        eq(pushTokens.token, token),
                    ),
                )
        } catch {
            throw new BaseException(COMMON_ERROR.INTERNAL_SERVER_ERROR)
        }
    }

    /** 회원 탈퇴와 토큰 변경이 겹쳐도 탈퇴 후 토큰이 새로 저장되지 않도록 잠근다. */
    private async lockActiveUser(
        userId: number,
        tx: Transaction,
    ): Promise<boolean> {
        const [user] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, userId), isNull(users.deletedAt)))
            .for('update')

        return Boolean(user)
    }
}
