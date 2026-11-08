import type { Server } from 'node:http'

import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { Expo } from 'expo-server-sdk'
import request from 'supertest'

import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter'
import { CommonResponseInterceptor } from '../../../common/interceptor/response.interceptor'
import { JwtStrategy } from '../../auth/strategies/jwt.strategy'

import { PushTokenController } from './push-token.controller'
import { PushTokenRepository } from './push-token.repository'
import { PushTokenService } from './push-token.service'

jest.mock('expo-server-sdk', () => ({
    Expo: { isExpoPushToken: jest.fn() },
}))

const path = '/users/me/push-tokens'
const pushToken = 'ExpoPushToken[api-device]'
const registration = { token: pushToken, platform: 'ios' }

describe('Push Token API', () => {
    let app: INestApplication<Server>
    let accessToken: string
    let repository: PushTokenRepository
    let register: jest.SpiedFunction<PushTokenRepository['register']>
    let unregister: jest.SpiedFunction<PushTokenRepository['unregister']>

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [
                PassportModule,
                JwtModule.register({ secret: 'test-push-token-secret' }),
            ],
            controllers: [PushTokenController],
            providers: [
                PushTokenService,
                PushTokenRepository,
                JwtStrategy,
                {
                    provide: ConfigService,
                    useValue: {
                        get: () => undefined,
                        getOrThrow: () => 'test-push-token-secret',
                    },
                },
            ],
        }).compile()

        app = module.createNestApplication()
        app.useGlobalFilters(new GlobalExceptionFilter())
        app.useGlobalInterceptors(new CommonResponseInterceptor())
        await app.listen(0, '127.0.0.1')
        repository = module.get(PushTokenRepository)
        accessToken = module.get(JwtService).sign({
            sub: 7,
            type: 'access',
            purpose: 'primary',
        })
    })

    beforeEach(() => {
        // API 경계 검증용 fixture. SDK 자체의 토큰 파서는 이 테스트의 대상이 아니다.
        jest.spyOn(Expo, 'isExpoPushToken').mockImplementation(
            (token) => token === pushToken,
        )
        register = jest.spyOn(repository, 'register')
        unregister = jest.spyOn(repository, 'unregister')
    })

    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    it.each(['put', 'delete'] as const)(
        '%s는 인증 누락과 잘못된 JWT를 거부한다',
        async (method) => {
            const body = method === 'put' ? registration : { token: pushToken }

            await request(app.getHttpServer())
                [method](path)
                .send(body)
                .expect(401)
            await request(app.getHttpServer())
                [method](path)
                .auth('invalid', { type: 'bearer' })
                .send(body)
                .expect(401)
            expect(register).not.toHaveBeenCalled()
            expect(unregister).not.toHaveBeenCalled()
        },
    )

    it.each([
        {},
        { ...registration, token: 'invalid' },
        { ...registration, token: ' ' },
        { ...registration, platform: 'web' },
        { ...registration, platform: undefined },
        { ...registration, userId: 99 },
    ])('잘못된 등록 입력은 저장소 호출 전에 거부한다: %j', async (body) => {
        await request(app.getHttpServer())
            .put(path)
            .auth(accessToken, { type: 'bearer' })
            .send(body)
            .expect(400)
        expect(register).not.toHaveBeenCalled()
    })

    it.each([{}, { token: 'invalid' }, { token: pushToken, userId: 99 }])(
        '잘못된 해제 입력은 저장소 호출 전에 거부한다: %j',
        async (body) => {
            await request(app.getHttpServer())
                .delete(path)
                .auth(accessToken, { type: 'bearer' })
                .send(body)
                .expect(400)
            expect(unregister).not.toHaveBeenCalled()
        },
    )

    it('등록 시 JWT 사용자와 정규화된 토큰·플랫폼만 전달하고 본문 없는 204를 반환한다', async () => {
        register.mockResolvedValue(undefined)
        const response = await request(app.getHttpServer())
            .put(path + '?userId=99')
            .auth(accessToken, { type: 'bearer' })
            .send({ token: '  ' + pushToken + '  ', platform: 'ios' })
            .expect(204)

        expect(register).toHaveBeenCalledWith(7, registration)
        expect(response.text).toBe('')
    })

    it('해제 시 JWT 사용자와 해당 토큰만 전달하고 본문 없는 204를 반환한다', async () => {
        unregister.mockResolvedValue(undefined)
        const response = await request(app.getHttpServer())
            .delete(path + '?userId=99')
            .auth(accessToken, { type: 'bearer' })
            .send({ token: pushToken })
            .expect(204)

        expect(unregister).toHaveBeenCalledWith(7, pushToken)
        expect(response.text).toBe('')
    })

    it.each(['put', 'delete'] as const)(
        '%s의 실제 저장소는 미연결 상태에서 성공 대신 501을 반환한다',
        async (method) => {
            const response = await request(app.getHttpServer())
                [method](path)
                .auth(accessToken, { type: 'bearer' })
                .send(method === 'put' ? registration : { token: pushToken })
                .expect(501)

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 501,
                    errorCode: 910002,
                    message: '푸시 토큰 저장소는 아직 연결되지 않았습니다.',
                },
            })
            expect(response.text).not.toContain(pushToken)
        },
    )

    it('Swagger에 인증·등록/해제 요청·204와 현재 501 상태를 명시한다', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().addBearerAuth().build(),
        )
        for (const operation of [
            document.paths[path].put,
            document.paths[path].delete,
        ]) {
            expect(operation?.security).toEqual([{ bearer: [] }])
            expect(operation?.responses).toHaveProperty('204')
            expect(operation?.responses).toHaveProperty('501')
            expect(operation?.requestBody).toBeDefined()
        }
    })
})
