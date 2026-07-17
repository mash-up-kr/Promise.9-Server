export type Severity = 'safe' | 'warning' | 'danger'

export type ScriptAction = {
    id: string
    group: string
    title: string
    description: string
    command: string
    args: string[]
    commandLabel: string
    severity: Severity
    env?: Record<string, string>
    warning?: string
    confirmationText?: string
    longRunning?: boolean
    terminalOnly?: boolean
    openUrl?: string
    readyUrl?: string
    readyStatus?: number
    scope?: 'lint' | 'test'
}

export const SCRIPT_ACTIONS: ScriptAction[] = [
    {
        id: 'lint',
        group: '검증',
        title: 'Lint',
        description: 'ESLint로 TypeScript 코드 품질을 확인합니다.',
        command: 'bun',
        args: ['run', 'lint'],
        commandLabel: 'bun run lint',
        severity: 'safe',
        scope: 'lint',
    },
    {
        id: 'test',
        group: '검증',
        title: 'Unit test',
        description: 'Jest 단위 테스트를 실행합니다.',
        command: 'bun',
        args: ['run', 'test'],
        commandLabel: 'bun run test',
        severity: 'safe',
        scope: 'test',
    },
    {
        id: 'build',
        group: '검증',
        title: 'Build',
        description: 'NestJS production build를 실행합니다.',
        command: 'bun',
        args: ['run', 'build'],
        commandLabel: 'bun run build',
        severity: 'safe',
    },
    {
        id: 'swagger-development',
        group: '개발 도구',
        title: 'Swagger API 문서',
        description: '개발 서버를 실행하고 Swagger API 문서를 엽니다.',
        command: 'bun',
        args: ['run', 'start:dev'],
        commandLabel:
            'APP_ENV=development SERVER_HOST=127.0.0.1 PORT=30001 bun run start:dev',
        severity: 'safe',
        env: {
            APP_ENV: 'development',
            SERVER_HOST: '127.0.0.1',
            PORT: '30001',
        },
        longRunning: true,
        openUrl: 'http://127.0.0.1:30001/api-docs',
    },
    {
        id: 'db-backup-development',
        group: '데이터베이스 읽기',
        title: '개발 DB 백업',
        description: '개발 DB를 pg_dump custom 포맷으로 백업합니다.',
        command: 'bun',
        args: ['run', 'db:backup', '--', '--env=development'],
        commandLabel: 'bun run db:backup -- --env=development',
        severity: 'safe',
        env: {
            APP_ENV: 'development',
        },
    },
    {
        id: 'db-backup-production',
        group: '데이터베이스 읽기',
        title: '운영 DB 백업',
        description: '운영 DB를 읽어서 백업 파일을 생성합니다.',
        command: 'bun',
        args: ['run', 'db:backup', '--', '--env=production'],
        commandLabel: 'bun run db:backup -- --env=production',
        severity: 'danger',
        env: {
            APP_ENV: 'production',
        },
        warning:
            '운영 DB 전체를 읽습니다. 트래픽이 많은 시간에는 부하가 생길 수 있습니다.',
        confirmationText: 'PRODUCTION BACKUP',
    },
    {
        id: 'db-visualize-development',
        group: '데이터베이스 읽기',
        title: '개발 DB ERD',
        description: '개발 DB의 실제 테이블 구조를 Mermaid 문서로 생성합니다.',
        command: 'bun',
        args: [
            'run',
            'db:visualize_mermaid',
            '--',
            '--env=development',
            '--output=.temp/database-erd-development.md',
        ],
        commandLabel:
            'bun run db:visualize_mermaid -- --env=development --output=.temp/database-erd-development.md',
        severity: 'safe',
        env: {
            APP_ENV: 'development',
        },
    },
    {
        id: 'db-visualize-production',
        group: '데이터베이스 읽기',
        title: '운영 DB ERD',
        description: '운영 DB의 실제 테이블 구조를 Mermaid 문서로 생성합니다.',
        command: 'bun',
        args: [
            'run',
            'db:visualize_mermaid',
            '--',
            '--env=production',
            '--output=.temp/database-erd-production.md',
        ],
        commandLabel:
            'bun run db:visualize_mermaid -- --env=production --output=.temp/database-erd-production.md',
        severity: 'danger',
        env: {
            APP_ENV: 'production',
        },
        warning:
            '운영 DB metadata를 조회합니다. 데이터 변경은 없지만 운영 DB에 연결합니다.',
        confirmationText: 'PRODUCTION ERD',
    },
    {
        id: 'db-generate',
        group: '스키마 관리',
        title: 'Migration 생성',
        description: 'Drizzle schema 변경사항으로 migration 파일을 생성합니다.',
        command: 'bun',
        args: ['run', 'db:generate'],
        commandLabel: 'bun run db:generate',
        severity: 'warning',
        warning: '작업 트리에 새 migration 파일이 생성될 수 있습니다.',
        confirmationText: 'GENERATE MIGRATION',
    },
    {
        id: 'db-migrate-development',
        group: '스키마 관리',
        title: '개발 DB migrate',
        description: '개발 DB에 pending migration을 적용합니다.',
        command: 'bun',
        args: ['run', 'db:migrate'],
        commandLabel: 'APP_ENV=development bun run db:migrate',
        severity: 'warning',
        env: {
            APP_ENV: 'development',
        },
        warning: '개발 DB schema가 변경됩니다.',
        confirmationText: 'DEVELOPMENT MIGRATE',
    },
    {
        id: 'db-migrate-production',
        group: '스키마 관리',
        title: '운영 DB migrate',
        description: '운영 DB에 pending migration을 적용합니다.',
        command: 'bun',
        args: ['run', 'db:migrate'],
        commandLabel: 'APP_ENV=production bun run db:migrate',
        severity: 'danger',
        env: {
            APP_ENV: 'production',
        },
        warning:
            '운영 DB schema를 변경합니다. migration SQL과 백업 상태를 먼저 확인해야 합니다.',
        confirmationText: 'PRODUCTION MIGRATE',
    },
    {
        id: 'db-push-development',
        group: '스키마 관리',
        title: '개발 DB push',
        description:
            'migration 없이 개발 DB schema를 Drizzle schema에 맞춥니다.',
        command: 'bun',
        args: ['run', 'db:push'],
        commandLabel: 'APP_ENV=development bun run db:push',
        severity: 'warning',
        terminalOnly: true,
        env: {
            APP_ENV: 'development',
        },
        warning: 'migration 이력 없이 개발 DB schema가 직접 변경됩니다.',
    },
    {
        id: 'db-push-production',
        group: '스키마 관리',
        title: '운영 DB push',
        description:
            'migration 없이 운영 DB schema를 Drizzle schema에 맞춥니다.',
        command: 'bun',
        args: ['run', 'db:push'],
        commandLabel: 'APP_ENV=production bun run db:push',
        severity: 'danger',
        terminalOnly: true,
        env: {
            APP_ENV: 'production',
        },
        warning:
            '운영 DB를 migration 없이 직접 변경합니다. 데이터 손실 가능성이 있으므로 일반적으로 피해야 합니다.',
    },
    {
        id: 'db-studio-development',
        group: '개발 도구',
        title: '개발 Drizzle Studio',
        description: '개발 DB용 Drizzle Studio를 실행합니다.',
        command: 'bun',
        args: ['run', 'db:studio', '--', '--host=127.0.0.1', '--port=49831'],
        commandLabel:
            'APP_ENV=development bun run db:studio -- --host=127.0.0.1 --port=49831',
        severity: 'warning',
        env: {
            APP_ENV: 'development',
        },
        warning: 'Drizzle Studio에서 개발 DB 데이터를 수정할 수 있습니다.',
        confirmationText: 'DEVELOPMENT STUDIO',
        longRunning: true,
        openUrl: 'https://local.drizzle.studio?port=49831',
        readyUrl: 'http://127.0.0.1:49831',
        readyStatus: 404,
    },
    {
        id: 'db-studio-production',
        group: '개발 도구',
        title: '운영 Drizzle Studio',
        description: '운영 DB용 Drizzle Studio를 실행합니다.',
        command: 'bun',
        args: ['run', 'db:studio', '--', '--host=127.0.0.1', '--port=49832'],
        commandLabel:
            'APP_ENV=production bun run db:studio -- --host=127.0.0.1 --port=49832',
        severity: 'danger',
        env: {
            APP_ENV: 'production',
        },
        warning:
            '운영 DB 데이터를 브라우저에서 조회/수정할 수 있습니다. 접근 자체가 운영 작업입니다.',
        confirmationText: 'PRODUCTION STUDIO',
        longRunning: true,
        openUrl: 'https://local.drizzle.studio?port=49832',
        readyUrl: 'http://127.0.0.1:49832',
        readyStatus: 404,
    },
]
