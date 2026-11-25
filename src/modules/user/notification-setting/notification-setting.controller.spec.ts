import type { Server } from 'node:http'

import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter'
import { CommonResponseInterceptor } from '../../../common/interceptor/response.interceptor'
import { JwtStrategy } from '../../auth/strategies/jwt.strategy'

import { NotificationSettingController } from './notification-setting.controller'
import { NotificationSettingRepository } from './notification-setting.repository'
import { NotificationSettingService } from './notification-setting.service'

const path = '/users/me/notification-settings'

describe('Notification Setting API', () => {
    let app: INestApplication<Server>
    let accessToken: string
    const repository = { find: jest.fn(), update: jest.fn() }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [
                PassportModule,
                JwtModule.register({ secret: 'test-notification-secret' }),
            ],
            controllers: [NotificationSettingController],
            providers: [
                NotificationSettingService,
                {
                    provide: NotificationSettingRepository,
                    useValue: repository,
                },
                JwtStrategy,
                {
                    provide: ConfigService,
                    useValue: {
                        get: () => undefined,
                        getOrThrow: () => 'test-notification-secret',
                    },
                },
            ],
        }).compile()

        app = module.createNestApplication()
        app.useGlobalFilters(new GlobalExceptionFilter())
        app.useGlobalInterceptors(new CommonResponseInterceptor())
        await app.listen(0, '127.0.0.1')
        accessToken = module.get(JwtService).sign({
            sub: 7,
            type: 'access',
            purpose: 'primary',
        })
    })

    beforeEach(() => {
        jest.clearAllMocks()
        repository.find.mockResolvedValue({ email: true, push: true })
        repository.update.mockResolvedValue({ email: false, push: true })
    })

    afterAll(async () => app?.close())

    it('인증 누락과 잘못된 JWT를 거부한다', async () => {
        const server = app.getHttpServer()
        await request(server).get(path).expect(401)
        await request(server)
            .get(path)
            .auth('invalid', { type: 'bearer' })
            .expect(401)
        await request(server).patch(path).send({ email: false }).expect(401)
        expect(repository.find).not.toHaveBeenCalled()
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('조회는 JWT 사용자의 이메일·푸시 수신 여부를 반환한다', async () => {
        repository.find.mockResolvedValue({ email: false, push: true })

        const response = await request(app.getHttpServer())
            .get(path)
            .auth(accessToken, { type: 'bearer' })
            .expect(200)

        expect(response.body).toEqual({
            success: true,
            data: { email: false, push: true },
        })
        expect(repository.find).toHaveBeenCalledWith(7)
    })

    it.each([
        {},
        { email: 'false' },
        { push: null },
        { email: 1 },
        { email: true, userId: 99 },
        { email: true, sms: true },
    ])('잘못된 변경 입력은 저장소 호출 전에 거부한다: %j', async (body) => {
        await request(app.getHttpServer())
            .patch(path)
            .auth(accessToken, { type: 'bearer' })
            .send(body)
            .expect(400)
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('변경은 보낸 채널만 전달하고 변경 후 전체 설정을 반환한다', async () => {
        const response = await request(app.getHttpServer())
            .patch(path)
            .auth(accessToken, { type: 'bearer' })
            .send({ email: false })
            .expect(200)

        expect(repository.update).toHaveBeenCalledWith(7, { email: false })
        expect(response.body).toEqual({
            success: true,
            data: { email: false, push: true },
        })
    })

    it('조회·변경은 존재하지 않거나 탈퇴한 사용자를 거부한다', async () => {
        repository.find.mockResolvedValue(undefined)
        repository.update.mockResolvedValue(undefined)
        const notFound = {
            success: false,
            error: {
                code: 404,
                errorCode: 960001,
                message: '유저를 찾을 수 없습니다.',
            },
        }

        const getResponse = await request(app.getHttpServer())
            .get(path)
            .auth(accessToken, { type: 'bearer' })
            .expect(404)
        const patchResponse = await request(app.getHttpServer())
            .patch(path)
            .auth(accessToken, { type: 'bearer' })
            .send({ push: false })
            .expect(404)

        expect(getResponse.body).toMatchObject(notFound)
        expect(patchResponse.body).toMatchObject(notFound)
    })

    it('Swagger에 인증이 필요한 조회·변경 API와 오류 상태를 명시한다', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().addBearerAuth().build(),
        )
        const { get, patch } = document.paths[path]

        expect(get?.security).toEqual([{ bearer: [] }])
        expect(get?.responses).toHaveProperty('200')
        expect(get?.responses).toHaveProperty('404')
        expect(patch?.security).toEqual([{ bearer: [] }])
        expect(patch?.requestBody).toBeDefined()
        expect(patch?.responses).toHaveProperty('200')
        expect(patch?.responses).toHaveProperty('400')
        expect(patch?.responses).toHaveProperty('404')
    })
})
