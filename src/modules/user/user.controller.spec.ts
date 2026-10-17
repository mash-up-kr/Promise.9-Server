import type { Server } from 'node:http'

import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
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
                    useValue: {
                        findByUserId: () =>
                            Promise.resolve({ provider: 'google' }),
                    },
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
        { ...touch, userId: 99 },
        { ...touch, utm_source: null },
        { ...touch, captured_at: 'invalid' },
        { ...touch, captured_at: '2026-10-16T00:05:00.001Z' },
        { ...touch, captured_at: '2027-10-16T00:00:00.000Z' },
    ])('잘못된 접점·타인 지정 요청은 저장 전에 거부한다', async (body) => {
        await request(app.getHttpServer())
            .patch('/users/me/attribution')
            .auth(token, { type: 'bearer' })
            .send(body)
            .expect(400)
        expect(repository.syncAttribution).not.toHaveBeenCalled()
    })

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
                utm: null,
            },
        })
    })

    it('내 정보에는 저장된 최근 접점만 utm으로 포함한다', async () => {
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
                utm: latestTouch,
            },
        })
    })
})
