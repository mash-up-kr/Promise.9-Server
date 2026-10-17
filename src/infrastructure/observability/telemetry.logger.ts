import { writeSync } from 'node:fs'

import { ConsoleLogger, LogLevel } from '@nestjs/common'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

import { getLogCorrelation } from '../../common/http/request-context'
import { sanitizeLogValue } from '../../common/logging/redaction'
import type { ObservabilityConfig } from '../../config/observability.config'

const LEVELS: Record<ObservabilityConfig['logLevel'], LogLevel[]> = {
    debug: ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'],
    info: ['log', 'warn', 'error', 'fatal'],
    warn: ['warn', 'error', 'fatal'],
    error: ['error', 'fatal'],
}
const SEVERITY: Record<LogLevel, SeverityNumber> = {
    verbose: SeverityNumber.TRACE,
    debug: SeverityNumber.DEBUG,
    log: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
    fatal: SeverityNumber.FATAL,
}

// 기존 new Logger(Service.name) 호출을 보존하며 stdout과 OTLP에 같은 JSON을 기록한다.
export class TelemetryLogger extends ConsoleLogger {
    constructor(level: ObservabilityConfig['logLevel'] = 'info') {
        super({ json: true, colors: false, logLevels: LEVELS[level] })
    }

    protected override printMessages(
        messages: unknown[],
        loggerContext = '',
        logLevel: LogLevel = 'log',
        writeStreamType: 'stdout' | 'stderr' = 'stdout',
        errorStack?: unknown,
    ): void {
        const correlation = getLogCorrelation()
        for (const message of messages) {
            const safe = sanitizeLogValue(message)
            const fields =
                safe !== null &&
                typeof safe === 'object' &&
                !Array.isArray(safe)
                    ? safe
                    : { message: safe }
            const record = {
                ...fields,
                ...(errorStack ? { stack: sanitizeLogValue(errorStack) } : {}),
                timestamp: new Date().toISOString(),
                level: logLevel === 'log' ? 'info' : logLevel,
                context: loggerContext,
                ...correlation,
            }
            const body = JSON.stringify(record)
            // fatal 직후 process.exit(1)에서도 마스킹된 로컬 기록을 남긴다.
            if (logLevel === 'fatal') writeSync(process.stderr.fd, `${body}\n`)
            else process[writeStreamType].write(`${body}\n`)
            logs.getLogger('promise9.nest').emit({
                body,
                severityNumber: SEVERITY[logLevel],
                severityText: record.level.toUpperCase(),
                attributes: {
                    'logger.context': loggerContext,
                    ...(correlation.request_id
                        ? { 'request.id': correlation.request_id }
                        : {}),
                },
            })
        }
    }
}
