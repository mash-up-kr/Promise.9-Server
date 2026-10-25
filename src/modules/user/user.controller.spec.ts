import type { Server } from 'node:http'

import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { CommonResponseInterceptor } from '../../common/interceptor/response.interceptor'
import { JwtStrategy } from '../auth/strategies/jwt.strategy'

import { SocialAccountRepository } from './repository/social-account.repository'
import { UserRepository } from './repository/user.repository'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { MarketingTouch } from './user-attribution'

const touch: MarketingTouch = {
    touch_id: 'touch-instagram',
    captured_at: '2026-10-15T09:00:00.000Z',
    utm_source: 'instagram',
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
}

const latestTouch: MarketingTouch = {
    ...touch,
    touch_id: 'touch-newsletter',
    captured_at: '2026-10-15T12:00:00.000Z',
    utm_source: 'newsletter',
}

describe('User API: 계정 UTM', () => {
    let app: INestApplication<Server>
    let token: string
    const repository = {
        findActiveById: jest.fn(),
        syncAttribution: jest.fn(),
    }

    const socialRepository = { findByUserId: jest.fn() }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [
                PassportModule,
                JwtModule.register({ secret: 'test-utm-secret' }),
            ],
            controllers: [UserController],
            providers: [
                UserService,
                JwtStrategy,
                { provide: UserRepository, useValue: repository },
                {
                    provide: SocialAccountRepository,
                    useValue: socialRepository,
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: () => undefined,
                        getOrThrow: () => 'test-utm-secret',
                    },
                },
            ],
        }).compile()
        app = module.createNestApplication()
        app.useGlobalInterceptors(new CommonResponseInterceptor())
        await app.listen(0, '127.0.0.1')
        token = module
            .get(JwtService)
            .sign({ sub: 7, type: 'access', purpose: 'primary' })
    })

    beforeEach(() => {
        jest.clearAllMocks()
        socialRepository.findByUserId.mockResolvedValue({ provider: 'google' })
        jest.spyOn(Date, 'now').mockReturnValue(
            Date.parse('2026-10-16T00:00:00.000Z'),
        )
        repository.findActiveById.mockResolvedValue({
            id: 7,
            email: 'user@example.com',
            createdAt: new Date('2026-10-15T00:00:00.000Z'),
            firstMarketingTouch: null,
            lastMarketingTouch: null,
        })
        repository.syncAttribution.mockImplementation(
            (userId: number, incoming: MarketingTouch) =>
                Promise.resolve({
                    userId,
                    firstMarketingTouch: incoming,
                    lastMarketingTouch: incoming,
                }),
        )
    })

    afterEach(() => jest.restoreAllMocks())

    afterAll(async () => {
        await app?.close()
    })

    it('인증되지 않은 사용자와 잘못된 토큰의 갱신을 거부한다', async () => {
        await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .send(touch)
            .expect(401)
        await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth('invalid', { type: 'bearer' })
            .send(touch)
            .expect(401)
        expect(repository.syncAttribution).not.toHaveBeenCalled()
    })

    it('인증된 사용자 ID로만 갱신하고 첫 접점을 utm으로 반환한다', async () => {
        const response = await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth(token, { type: 'bearer' })
            .send(touch)
            .expect(200)
        expect(response.body).toEqual({
            success: true,
            data: {
                userId: 7,
                utm: touch,
            },
        })
        expect(repository.syncAttribution).toHaveBeenCalledWith(7, touch)
    })

    it('과거 접점을 동기화해도 저장된 최근 접점만 utm으로 반환한다', async () => {
        repository.syncAttribution.mockResolvedValue({
            userId: 7,
            firstMarketingTouch: touch,
            lastMarketingTouch: latestTouch,
        })
        const response = await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth(token, { type: 'bearer' })
            .send(touch)
            .expect(200)
        expect(response.body).toEqual({
            success: true,
            data: { userId: 7, utm: latestTouch },
        })
    })

    it.each([
        { ...touch, touch_id: undefined },
        { ...touch, captured_at: undefined },
        { ...touch, userId: 99 },
        { ...touch, utm_source: null },
        { ...touch, captured_at: 'invalid' },
        { ...touch, captured_at: '2026-10-16T00:05:00.001Z' },
        { ...touch, captured_at: '2027-10-16T00:00:00.000Z' },
    ])(
        '동기화 필드 누락·잘못된 접점·타인 지정 요청은 저장 전에 거부한다',
        async (body) => {
            await request(app.getHttpServer())
                .patch('/users/me/attribution')
                .auth(token, { type: 'bearer' })
                .send(body)
                .expect(400)
            expect(repository.syncAttribution).not.toHaveBeenCalled()
        },
    )

    it('서버 시각보다 정확히 5분 앞선 접점은 원래 시각으로 저장한다', async () => {
        const incoming = {
            ...touch,
            captured_at: '2026-10-16T00:05:00.000Z',
        }
        await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth(token, { type: 'bearer' })
            .send(incoming)
            .expect(200)
        expect(repository.syncAttribution).toHaveBeenCalledWith(7, incoming)
    })

    it('탈퇴했거나 존재하지 않는 계정의 접점을 갱신하지 않는다', async () => {
        repository.syncAttribution.mockResolvedValue(undefined)
        await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth(token, { type: 'bearer' })
            .send(touch)
            .expect(404)
    })

    it('UTM 없는 기존 계정도 내 정보 조회가 가능하다', async () => {
        const response = await request(app.getHttpServer())
            .get('/users/me')
            .auth(token, { type: 'bearer' })
            .expect(200)
        expect(response.body).toEqual({
            success: true,
            data: {
                userId: 7,
                email: 'user@example.com',
                provider: 'google',
                createdAt: '2026-10-15T00:00:00.000Z',
            },
        })
    })

    it('저장된 접점이 있어도 회원 정보만 반환한다', async () => {
        repository.findActiveById.mockResolvedValue({
            id: 7,
            email: 'user@example.com',
            createdAt: new Date('2026-10-15T00:00:00.000Z'),
            firstMarketingTouch: touch,
            lastMarketingTouch: latestTouch,
        })
        const response = await request(app.getHttpServer())
            .get('/users/me')
            .auth(token, { type: 'bearer' })
            .expect(200)
        expect(response.body).toEqual({
            success: true,
            data: {
                userId: 7,
                email: 'user@example.com',
                provider: 'google',
                createdAt: '2026-10-15T00:00:00.000Z',
            },
        })
    })

    it.each(['/users/me', '/users/me/attribution'])(
        '%s는 인증 누락·잘못된 토큰을 거부한다',
        async (path) => {
            await request(app.getHttpServer()).get(path).expect(401)
            await request(app.getHttpServer())
                .get(path)
                .auth('invalid', { type: 'bearer' })
                .expect(401)
            expect(repository.findActiveById).not.toHaveBeenCalled()
        },
    )

    it.each(['/users/me', '/users/me/attribution'])(
        '%s는 존재하지 않거나 탈퇴한 계정을 거부한다',
        async (path) => {
            repository.findActiveById.mockResolvedValue(undefined)
            await request(app.getHttpServer())
                .get(path)
                .auth(token, { type: 'bearer' })
                .expect(404)
            expect(repository.findActiveById).toHaveBeenCalledWith(7)
        },
    )

    it.each([null, latestTouch])(
        '접점 조회는 JWT의 계정에 저장된 최근 접점만 반환한다: %j',
        async (lastMarketingTouch) => {
            repository.findActiveById.mockResolvedValue({
                id: 7,
                firstMarketingTouch: touch,
                lastMarketingTouch,
            })
            const response = await request(app.getHttpServer())
                .get('/users/me/attribution?userId=99')
                .auth(token, { type: 'bearer' })
                .expect(200)
            expect(response.body).toEqual({
                success: true,
                data: { userId: 7, utm: lastMarketingTouch },
            })
            expect(repository.findActiveById).toHaveBeenCalledWith(7)
            expect(socialRepository.findByUserId).not.toHaveBeenCalled()
            expect(repository.syncAttribution).not.toHaveBeenCalled()
        },
    )

    it('소셜 계정이 없으면 기존 회원 조회의 unknown 제공자를 유지한다', async () => {
        socialRepository.findByUserId.mockResolvedValue(undefined)
        const response = await request(app.getHttpServer())
            .get('/users/me')
            .auth(token, { type: 'bearer' })
            .expect(200)
        expect(response.body).toEqual({
            success: true,
            data: {
                userId: 7,
                email: 'user@example.com',
                provider: 'unknown',
                createdAt: '2026-10-15T00:00:00.000Z',
            },
        })
    })

    it('Swagger는 회원 정보와 접점 응답 스키마를 분리한다', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().addBearerAuth().build(),
        )
        const schemas = document.components?.schemas
        expect(schemas?.MeResponseDto).toMatchObject({
            required: ['userId', 'email', 'provider', 'createdAt'],
        })
        expect(schemas?.MeResponseDto).toHaveProperty('properties.userId')
        expect(schemas?.MeResponseDto).not.toHaveProperty('properties.utm')
        expect(schemas?.UserAttributionResponseDto).toHaveProperty(
            'properties.utm.nullable',
            true,
        )
        const attribution = document.paths['/users/me/attribution']
        expect(attribution.get?.security).toEqual([{ bearer: [] }])
        for (const operation of [attribution.get, attribution.patch]) {
            expect(operation?.responses['200']).toHaveProperty(
                'content.application/json.schema.properties.data.$ref',
                '#/components/schemas/UserAttributionResponseDto',
            )
        }
    })
})
