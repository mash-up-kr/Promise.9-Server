import type { Server } from 'node:http'

import { INestApplication, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter'
import {
    DatabaseService,
    Transaction,
} from '../../config/database/database.service'
import { PushTokenRepository } from '../user/push-token/push-token.repository'
import { UserRepository } from '../user/repository/user.repository'

import { AppleProvider } from './providers/apple.provider'
import { GoogleProvider } from './providers/google.provider'
import { KakaoProvider } from './providers/kakao.provider'
import { RefreshTokenRepository } from './repository/refresh-token.repository'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { hashToken } from './crypto.utils'

jest.mock('./providers/apple.provider')
jest.mock('./providers/google.provider')
jest.mock('./providers/kakao.provider')
jest.mock('jose', () => ({}))
// Expo SDK는 ESM이므로 API 경계 테스트에서는 fixture의 토큰 판별만 제공한다.
jest.mock('expo-server-sdk', () => ({
    Expo: {
        isExpoPushToken: (token: string) =>
            token === 'ExponentPushToken[logout-device]',
    },
}))

const pushToken = 'ExponentPushToken[logout-device]'
const refreshSecret = 'test-logout-refresh-secret'

describe('Auth 로그아웃 API', () => {
    let app: INestApplication<Server>
    let jwt: JwtService
    const tx = {} as Transaction
    const transaction = jest.fn(
        async (work: (tx: Transaction) => Promise<void>) => work(tx),
    )
    const deleteRefreshToken = jest.fn()
    const deletePushToken = jest.fn()
    const findByHash = jest.fn()
    const findActiveByHashAndUser = jest.fn()

    const signRefreshToken = (expiresIn = 60) =>
        jwt.sign(
            { sub: 7, type: 'refresh' },
            { secret: refreshSecret, expiresIn },
        )

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [JwtModule.register({})],
            controllers: [AuthController],
            providers: [
                AuthService,
                {
                    provide: DatabaseService,
                    useValue: { db: { transaction } },
                },
                { provide: UserRepository, useValue: {} },
                {
                    provide: RefreshTokenRepository,
                    useValue: {
                        deleteByHashAndUser: deleteRefreshToken,
                        findByHash,
                        findActiveByHashAndUser,
                    },
                },
                {
                    provide: PushTokenRepository,
                    useValue: { deleteByUserAndToken: deletePushToken },
                },
                ...[AppleProvider, GoogleProvider, KakaoProvider].map(
                    (provide) => ({ provide, useValue: {} }),
                ),
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: (key: string) =>
                            ({
                                JWT_ACCESS_SECRET: 'test-logout-access-secret',
                                JWT_REFRESH_SECRET: refreshSecret,
                                JWT_ACCESS_EXPIRES_IN: '15m',
                                JWT_REFRESH_EXPIRES_IN: '30d',
                            })[key],
                    },
                },
            ],
        }).compile()
        app = module.createNestApplication()
        app.useGlobalFilters(new GlobalExceptionFilter())
        await app.listen(0, '127.0.0.1')
        jwt = module.get(JwtService)
    })

    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    it.each([60, -60])(
        '유효하거나 만료된 리프레시 토큰으로 두 토큰을 함께 삭제한다 (expiresIn=%s)',
        async (expiresIn) => {
            const refreshToken = signRefreshToken(expiresIn)
            const response = await request(app.getHttpServer())
                .post('/auth/logout?userId=99')
                .send({
                    refreshToken,
                    pushToken: '  ' + pushToken + '  ',
                    userId: 99,
                })
                .expect(204)

            expect(response.text).toBe('')
            expect(transaction).toHaveBeenCalledTimes(1)
            expect(deleteRefreshToken).toHaveBeenCalledWith(
                hashToken(refreshToken),
                7,
                tx,
            )
            expect(deletePushToken).toHaveBeenCalledWith(7, pushToken, tx)
        },
    )

    it.each([undefined, null, '', 'invalid', ' ', 123, {}, []])(
        'pushToken이 없거나 잘못되어도 로그아웃은 성공한다: %j',
        async (value) => {
            await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: signRefreshToken(), pushToken: value })
                .expect(204)
            expect(deleteRefreshToken).toHaveBeenCalledTimes(1)
            expect(deletePushToken).not.toHaveBeenCalled()
        },
    )

    it('DB에 리프레시 토큰이 없어도 반복 요청으로 푸시 토큰을 정리한다', async () => {
        const body = { refreshToken: signRefreshToken(-60), pushToken }
        for (let retry = 0; retry < 2; retry++) {
            await request(app.getHttpServer())
                .post('/auth/logout')
                .send(body)
                .expect(204)
        }
        expect(findByHash).not.toHaveBeenCalled()
        expect(deletePushToken).toHaveBeenCalledTimes(2)
    })

    it('서명 위조, 잘못된 토큰 용도와 사용자 ID는 삭제 전에 거부한다', async () => {
        const invalidTokens = [
            'invalid',
            jwt.sign({ sub: 7, type: 'refresh' }, { secret: 'wrong-secret' }),
            jwt.sign({ sub: 7, type: 'access' }, { secret: refreshSecret }),
            jwt.sign({ type: 'refresh' }, { secret: refreshSecret }),
            jwt.sign({ sub: '7', type: 'refresh' }, { secret: refreshSecret }),
        ]
        for (const refreshToken of invalidTokens) {
            await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken, pushToken })
                .expect(401)
        }
        expect(transaction).not.toHaveBeenCalled()
        expect(deleteRefreshToken).not.toHaveBeenCalled()
        expect(deletePushToken).not.toHaveBeenCalled()
    })

    it.each(['/auth/refresh', '/auth/withdraw'])(
        '%s는 만료된 리프레시 토큰을 계속 거부한다',
        async (path) => {
            const agent = request(app.getHttpServer())
            const response = await (
                path.endsWith('withdraw')
                    ? agent.delete(path)
                    : agent.post(path)
            )
                .send({ refreshToken: signRefreshToken(-60) })
                .expect(401)
            expect(response.body).toMatchObject({
                error: { errorCode: 950002 },
            })
            expect(findByHash).not.toHaveBeenCalled()
            expect(findActiveByHashAndUser).not.toHaveBeenCalled()
            expect(transaction).not.toHaveBeenCalled()
        },
    )

    it('푸시 삭제 실패를 트랜잭션에 전파하고 SQL의 토큰을 응답과 로그에 노출하지 않는다', async () => {
        const refreshToken = signRefreshToken()
        deletePushToken.mockRejectedValueOnce(new Error('SQL: ' + pushToken))
        const logger = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        const response = await request(app.getHttpServer())
            .post('/auth/logout')
            .send({ refreshToken, pushToken })
            .expect(500)

        await expect(transaction.mock.results[0].value).rejects.toThrow()
        expect(response.body).toMatchObject({ error: { errorCode: 910002 } })
        for (const output of [
            response.text,
            JSON.stringify(logger.mock.calls),
        ]) {
            expect(output).not.toContain(pushToken)
            expect(output).not.toContain(refreshToken)
            expect(output).not.toContain(hashToken(refreshToken))
        }
    })
})
