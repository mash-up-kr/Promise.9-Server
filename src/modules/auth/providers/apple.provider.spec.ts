import { generateKeyPairSync } from 'node:crypto'

import { ConfigService } from '@nestjs/config'
import { jwtVerify } from 'jose'

import { ValidatedEnvironment } from '../../../config/environment'

import { AppleProvider } from './apple.provider'

jest.mock('jose', () => {
    const jwt = {
        setSubject: jest.fn().mockReturnThis(),
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setAudience: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        encrypt: jest.fn().mockResolvedValue('encrypted-token'),
        sign: jest.fn().mockResolvedValue('client-secret'),
    }
    return {
        createRemoteJWKSet: jest.fn(),
        jwtVerify: jest.fn(),
        EncryptJWT: jest.fn(() => jwt),
        SignJWT: jest.fn(() => jwt),
        jwtDecrypt: jest
            .fn()
            .mockResolvedValue({ payload: { token: 'apple-refresh-token' } }),
    }
})

describe('AppleProvider', () => {
    const verifyMock = jwtVerify as jest.MockedFunction<typeof jwtVerify>
    const payload = {
        sub: 'apple-user',
        email: 'user@example.com',
        aud: 'com.example.app',
    }
    let provider: AppleProvider
    let fetchMock: jest.SpiedFunction<typeof fetch>

    beforeEach(() => {
        const { privateKey } = generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
        })
        const config = new ConfigService<ValidatedEnvironment, true>({
            APPLE_CLIENT_ID: payload.aud,
            APPLE_TEAM_ID: 'TEAM',
            APPLE_KEY_ID: 'KEY',
            APPLE_PRIVATE_KEY: privateKey.export({
                format: 'pem',
                type: 'pkcs8',
            }),
            APPLE_TOKEN_ENCRYPTION_KEY: '01'.repeat(32),
        })
        provider = new AppleProvider(config)
        verifyMock.mockReset().mockResolvedValue({
            payload,
            protectedHeader: { alg: 'RS256' },
        })
        fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    id_token: 'exchanged-id-token',
                    refresh_token: 'apple-refresh-token',
                }),
            ),
        )
    })

    afterEach(() => jest.restoreAllMocks())

    it('로그인 시 code를 교환하고 탈퇴 시 저장한 token으로 revoke한다', async () => {
        const result = await provider.verify('id-token', 'code')
        expect(result).toEqual({
            providerId: payload.sub,
            email: payload.email,
            providerClientId: payload.aud,
            providerRefreshTokenEncrypted: 'encrypted-token',
        })
        expect(
            Object.fromEntries(
                fetchMock.mock.calls[0][1]?.body as URLSearchParams,
            ),
        ).toEqual({
            grant_type: 'authorization_code',
            code: 'code',
            client_id: payload.aud,
            client_secret: 'client-secret',
        })
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
        await provider.revoke('encrypted-token', payload.aud)
        expect(fetchMock.mock.calls[1][0]).toBe(
            'https://appleid.apple.com/auth/revoke',
        )
        expect(
            Object.fromEntries(
                fetchMock.mock.calls[1][1]?.body as URLSearchParams,
            ),
        ).toEqual({
            token: 'apple-refresh-token',
            token_type_hint: 'refresh_token',
            client_id: payload.aud,
            client_secret: 'client-secret',
        })
    })

    it('code와 ID token의 사용자가 다르면 거부한다', async () => {
        verifyMock
            .mockResolvedValueOnce({
                payload,
                protectedHeader: { alg: 'RS256' },
            })
            .mockResolvedValueOnce({
                payload: { ...payload, sub: 'other-user' },
                protectedHeader: { alg: 'RS256' },
            })
        await expect(provider.verify('id-token', 'code')).rejects.toMatchObject(
            { status: 401 },
        )
    })

    it('code가 없으면 Apple 요청을 보내지 않는다', async () => {
        await expect(provider.verify('id-token')).rejects.toMatchObject({
            status: 400,
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Apple revoke 실패를 성공으로 처리하지 않는다', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
        await expect(
            provider.revoke('encrypted-token', payload.aud),
        ).rejects.toMatchObject({ status: 502 })
    })
})
