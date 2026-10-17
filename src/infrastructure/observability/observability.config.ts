import { z } from 'zod'

const configSchema = z.object({
    OTEL_ENABLED: z.enum(['true', 'false']).default('false'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_EXPORTER_OTLP_PROTOCOL: z
        .literal('http/protobuf')
        .default('http/protobuf'),
    OTEL_TRACES_SAMPLER_ARG: z
        .string()
        .trim()
        .min(1)
        .default('1')
        .pipe(z.coerce.number<string>().min(0).max(1)),
    OTEL_SERVICE_NAME: z.string().min(1).default('promise9-api'),
    OTEL_SERVICE_VERSION: z.string().min(1).default('development'),
    OTEL_HOST_ID: z.string().min(1).optional(),
    APP_ENV: z.enum(['development', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

// Nest/DB를 로드하기 전에 실행하므로 Nest ConfigModule과 분리한다.
export function readObservabilityConfig(env: NodeJS.ProcessEnv = process.env) {
    const result = configSchema.safeParse(env)
    if (!result.success) {
        // 설정 원문에는 인증 헤더가 있을 수 있어 필드명만 출력한다.
        throw new Error(
            `관측 설정 오류: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
        )
    }

    const config = result.data
    let endpoint: string | undefined
    if (config.OTEL_ENABLED === 'true') {
        try {
            const url = new URL(config.OTEL_EXPORTER_OTLP_ENDPOINT ?? '')
            const localHttp =
                url.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            if (
                (url.protocol !== 'https:' && !localHttp) ||
                url.username ||
                url.password ||
                url.search ||
                url.hash
            ) {
                throw new Error('Invalid endpoint')
            }
            endpoint = url.toString().replace(/\/$/, '')
        } catch {
            throw new Error(
                'OTEL_ENABLED=true이면 인증정보·쿼리가 없는 OTEL_EXPORTER_OTLP_ENDPOINT가 필요합니다. HTTPS 또는 로컬 HTTP 주소를 사용하세요.',
            )
        }
    }

    return {
        enabled: config.OTEL_ENABLED === 'true',
        endpoint,
        sampleRatio: config.OTEL_TRACES_SAMPLER_ARG,
        serviceName: config.OTEL_SERVICE_NAME,
        serviceVersion: config.OTEL_SERVICE_VERSION,
        hostId: config.OTEL_HOST_ID,
        environment: config.APP_ENV,
        logLevel: config.LOG_LEVEL,
    }
}

export type ObservabilityConfig = ReturnType<typeof readObservabilityConfig>
