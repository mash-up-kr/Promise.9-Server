# Database Operations

RDS 같은 managed DB를 쓰지 않기 때문에 snapshot이나 백업을 로컬에서 수동으로 관리할 수 있도록 DB 운영 보조 스크립트를 둔다.

## 전제 조건

- `.env` 또는 실행 환경에 `DATABASE_URL_DEVELOPMENT`, `DATABASE_URL_PRODUCTION`이 있어야 한다.
- 백업/검증은 PostgreSQL client tools의 `pg_dump`, `pg_restore`를 사용한다.

## 명령어

| 목적        | 명령어                                                             |
| ----------- | ------------------------------------------------------------------ |
| 백업        | `bun run db:backup -- --env=development`                           |
| 백업 검증   | `bun run db:backup:verify -- --file=backups/database/example.dump` |
| 상태 확인   | `bun run db:health -- --env=development`                           |
| Mermaid ERD | `bun run db:visualize_mermaid -- --env=development`                |

`--env`를 지정하지 않으면 `APP_ENV`를 사용하고, 없으면 `development`로 동작한다.
백업 기본 저장 위치는 `backups/database`이며 `.gitignore` 대상이다.

## 예시

```bash
bun run db:backup -- --env=development --sslmode=require
bun run db:backup:verify -- --file=backups/database/dev.dump
bun run db:health -- --env=development
bun run db:visualize_mermaid -- --env=development
```

## 운영 환경 주의사항

- 운영 DB 대상 실행은 `--env=production` 여부를 먼저 확인한다.
- 백업은 읽기 작업이지만 DB 전체를 읽으므로 부하가 생길 수 있다.
- 이 문서의 스크립트는 복구를 수행하지 않는다. 복구 절차는 별도 PR에서 다룬다.
