import { readObservabilityConfig } from './observability.config'

describe('관측 환경변수', () => {
    it('인증정보 없이도 기본으로 부팅하고 원격 전송은 끈다', () => {
        expect(readObservabilityConfig({})).toMatchObject({
            enabled: false,
            logLevel: 'info',
        })
    })

    it.each([
        undefined,
        '',
        'invalid',
        'http://remote.test/otlp',
        'https://user:secret@remote.test',
        'https://remote.test?token=secret',
    ])(
        '잘못된 전송 주소를 거부하면서 인증정보를 출력하지 않는다: %s',
        (endpoint) => {
            expect(() =>
                readObservabilityConfig({
                    OTEL_ENABLED: 'true',
                    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
                }),
            ).toThrow('OTEL_EXPORTER_OTLP_ENDPOINT')
            try {
                readObservabilityConfig({
                    OTEL_ENABLED: 'true',
                    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
                })
            } catch (error) {
                expect(String(error)).not.toContain('secret')
            }
        },
    )

    it.each(['https://otlp.example.test/otlp/', 'http://127.0.0.1:4318'])(
        'HTTPS와 로컬 테스트 수집기를 허용한다: %s',
        (endpoint) => {
            expect(
                readObservabilityConfig({
                    OTEL_ENABLED: 'true',
                    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
                }).endpoint,
            ).toBe(endpoint.replace(/\/$/, ''))
        },
    )

    it.each(['', ' ', '-1', '1.1', 'not-a-number'])(
        '유효하지 않은 샘플링 비율을 거부한다: %s',
        (ratio) => {
            expect(() =>
                readObservabilityConfig({ OTEL_TRACES_SAMPLER_ARG: ratio }),
            ).toThrow('OTEL_TRACES_SAMPLER_ARG')
        },
    )
})
