import { ConfigModule, ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { AnalyticsModule } from './analytics.module'
import { AnalyticsService } from './analytics.service'
import { FirehoseTransport } from './firehose.transport'

describe('Analytics 종료 순서', () => {
    it('HTTP 연결 정리 중 발생한 이벤트까지 보내고 transport를 마지막에 닫는다', async () => {
        const order: string[] = []
        const sendBatch = jest
            .fn<Promise<number[]>, [Buffer[], AbortSignal]>()
            .mockImplementation(() => {
                order.push('send')
                return Promise.resolve([])
            })
        const close = jest.fn(() => {
            order.push('transport-close')
        })
        const module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                AnalyticsModule,
            ],
        })
            .overrideProvider(ConfigService)
            .useValue({
                get: (key: string) =>
                    key === 'ANALYTICS_ENABLED' ? true : 'production',
            })
            .overrideProvider(FirehoseTransport)
            .useValue({ sendBatch, close })
            .compile()
        const app = module.createNestApplication()
        await app.init()
        const analytics = app.get(AnalyticsService)
        // 실제 Nest 종료 훅을 실행하되 HTTP close 경계에서 완료되는 요청을 모사한다.
        jest.spyOn(app.getHttpAdapter(), 'close').mockImplementationOnce(() => {
            order.push('http-close')
            expect(
                analytics.track({ event_name: 'request_completed' }).accepted,
            ).toBe(true)
            return Promise.resolve()
        })
        await app.close()
        expect(order).toEqual(['http-close', 'send', 'transport-close'])
        expect(sendBatch.mock.calls[0][0]).toHaveLength(1)
        expect(close).toHaveBeenCalledTimes(1)
        expect(analytics.track({ event_name: 'late' })).toEqual({
            accepted: false,
            reason: 'closing',
        })
    })
})
