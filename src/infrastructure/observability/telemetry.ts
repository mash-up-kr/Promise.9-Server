import { hostname } from 'node:os'

import { diag, DiagLogLevel } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import {
    ExpressInstrumentation,
    ExpressLayerType,
} from '@opentelemetry/instrumentation-express'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import {
    defaultResource,
    envDetector,
    resourceFromAttributes,
} from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import {
    AggregationType,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace'

import { isHealthCheck } from './http-request'
import { ObservabilityConfig } from './observability.config'
import { RedactingSpanProcessor } from './redacting-span.processor'
import { sanitizeLogValue } from './redaction'

let sdk: NodeSDK | undefined
let shutdown: Promise<void> | undefined

const batchOptions = {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 8000,
}

// exporter 오류를 OTLP에 재전송하면 재귀가 되므로 stderr에만 남긴다.
function diagnostic(level: string, messages: unknown[]) {
    process.stderr.write(
        `${JSON.stringify({ timestamp: new Date().toISOString(), level, context: 'OpenTelemetry', message: sanitizeLogValue(messages) })}\n`,
    )
}

export function startTelemetry(config: ObservabilityConfig): void {
    if (!config.enabled || sdk) return
    diag.setLogger(
        {
            error: (...messages: unknown[]) => diagnostic('error', messages),
            warn: (...messages: unknown[]) => diagnostic('warn', messages),
            info: () => undefined,
            debug: () => undefined,
            verbose: () => undefined,
        },
        DiagLogLevel.WARN,
    )

    const exporterOptions = (signal: string) => ({
        url: `${config.endpoint}/v1/${signal}`,
        timeoutMillis: 5000,
    })
    sdk = new NodeSDK({
        resource: defaultResource().merge(
            resourceFromAttributes({
                'service.name': config.serviceName,
                'service.namespace': 'promise9',
                'service.version': config.serviceVersion,
                'service.instance.id': `${hostname()}:${process.pid}`,
                'deployment.environment': config.environment,
                'deployment.environment.name': config.environment,
                'host.name': hostname(),
                'host.id': config.hostId ?? hostname(),
            }),
        ),
        // process.command_args 등을 자동 수집하지 않는다.
        resourceDetectors: [envDetector],
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(config.sampleRatio),
        }),
        spanProcessors: [
            new RedactingSpanProcessor({
                exporter: new OTLPTraceExporter(exporterOptions('traces')),
                ...batchOptions,
            }),
        ],
        logRecordProcessors: [
            new BatchLogRecordProcessor({
                exporter: new OTLPLogExporter(exporterOptions('logs')),
                ...batchOptions,
            }),
        ],
        metricReaders: [
            new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter(exporterOptions('metrics')),
                exportIntervalMillis: 60_000,
                exportTimeoutMillis: 8000,
            }),
        ],
        views: [
            // HTTP 메트릭은 라우트가 확정된 middleware에서 한 번만 기록한다.
            {
                meterName: '@opentelemetry/instrumentation-http',
                aggregation: { type: AggregationType.DROP },
            },
            {
                meterName: '@opentelemetry/instrumentation-undici',
                aggregation: { type: AggregationType.DROP },
            },
        ],
        instrumentations: [
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (request) =>
                    isHealthCheck(request.method, request.url ?? ''),
            }),
            new ExpressInstrumentation({
                ignoreLayersType: [
                    ExpressLayerType.MIDDLEWARE,
                    ExpressLayerType.ROUTER,
                ],
            }),
            new NestInstrumentation(),
            new UndiciInstrumentation(),
            new RuntimeNodeInstrumentation({
                monitoringPrecision: 20,
                captureUncaughtException: false,
            }),
        ],
    })
    sdk.start()
}

export function shutdownTelemetry(): Promise<void> {
    shutdown ??= sdk?.shutdown() ?? Promise.resolve()
    return shutdown
}
