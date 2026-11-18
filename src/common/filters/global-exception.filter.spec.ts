import { ArgumentsHost, HttpException, Logger } from '@nestjs/common'

import { GlobalExceptionFilter } from './global-exception.filter'

describe('GlobalExceptionFilter', () => {
    afterEach(() => jest.restoreAllMocks())

    it('오류 로그에 공유 토큰을 남기지 않는다', () => {
        const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation()
        const json = jest.fn()
        const host = {
            switchToHttp: () => ({
                getRequest: () => ({
                    method: 'GET',
                    originalUrl: '/api/v1/shared-folders/secretToken123',
                }),
                getResponse: () => ({ status: () => ({ json }) }),
            }),
        } as unknown as ArgumentsHost

        new GlobalExceptionFilter().catch(new HttpException('없음', 404), host)

        const message = String(debug.mock.calls[0][0])
        expect(message).not.toContain('secretToken123')
        expect(message).toContain('/api/v1/shared-folders/***')
    })
})
