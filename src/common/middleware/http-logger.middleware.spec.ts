import { Logger } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

import { httpLoggerMiddleware } from './http-logger.middleware'

describe('httpLoggerMiddleware', () => {
    afterEach(() => jest.restoreAllMocks())

    it('접근 로그에 공유 토큰을 남기지 않는다', () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
        let onFinish: () => void = () => undefined
        const res = {
            statusCode: 200,
            on: (_event: string, handler: () => void) => {
                onFinish = handler
            },
        } as unknown as Response
        const req = {
            method: 'GET',
            path: '/api/v1/shared-folders/secretToken123',
            originalUrl: '/api/v1/shared-folders/secretToken123?limit=20',
        } as Request

        httpLoggerMiddleware(req, res, jest.fn() as NextFunction)
        onFinish()

        const message = String(log.mock.calls[0][0])
        expect(message).not.toContain('secretToken123')
        expect(message).toContain('/api/v1/shared-folders/***?limit=20')
    })
})
