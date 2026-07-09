# Database Restore

DB 복구는 데이터를 변경할 수 있으므로 백업/검증과 별도로 관리한다.

이 스크립트는 `DATABASE_URL_*`이 가리키는 단일 PostgreSQL database의 백업 파일을 복구한다. 특정 테이블 단위 복구 옵션은 제공하지 않는다.

## 기본 복구

```bash
bun run db:restore -- --env=development --file=backups/database/example.dump
```

- 실행 전에 `pg_restore --list`로 백업 파일을 먼저 검증한다.
- 실제 복구 전 `Y`와 `프로미스 나인`을 입력해야 한다.
- 복구 전에 현재 대상 DB를 `backups/database/pre-restore`에 먼저 백업한다.
- 현재 DB 백업이 실패하면 복구를 실행하지 않는다.
- 검증이 끝난 백업 파일만 `pg_restore`로 복구한다.
- 기본 복구는 기존 객체를 drop하지 않는 `pg_restore` 실행이다.
- 대상 DB 상태에 따라 객체 중복이나 데이터 충돌로 실패할 수 있다.

## 실행 전 확인

실제 복구 전 아래 값을 순서대로 입력해야 한다.

| 질문                | 입력값          |
| ------------------- | --------------- |
| 진짜 실행할 건가요? | `Y`             |
| 우리팀 이름은?      | `프로미스 나인` |

## Clean 복구

```bash
bun run db:restore -- --env=development --file=backups/database/example.dump --clean --confirm=RESTORE_DEVELOPMENT
```

`--clean`은 기존 객체를 drop할 수 있으므로 환경별 확인 토큰이 필요하다.

| 환경          | 확인 토큰             |
| ------------- | --------------------- |
| `development` | `RESTORE_DEVELOPMENT` |
| `production`  | `RESTORE_PRODUCTION`  |

## 운영 DB 복구

```bash
bun run db:restore -- --env=production --file=backups/database/example.dump --allow-production --confirm=RESTORE_PRODUCTION
```

- 운영 DB 복구는 `--allow-production`과 `--confirm=RESTORE_PRODUCTION`이 모두 필요하다.
- 운영 복구 전에는 대상 DB, 백업 파일 생성 시점, 백업 파일 검증 결과, 복구 전 현재 DB 백업 위치를 먼저 확인한다.
