# Database Setup

이 프로젝트는 PostgreSQL과 Drizzle ORM을 사용한다.

## 환경변수

`APP_ENV` 값에 따라 사용할 DB URL이 결정된다.

| APP_ENV | 사용 환경변수 |
| --- | --- |
| `development` | `DATABASE_URL_DEVELOPMENT` |
| `production` | `DATABASE_URL_PRODUCTION` |

`APP_ENV`를 지정하지 않으면 `development`로 동작한다.

## Schema

도메인별 schema를 정의하고, `src/config/database/schema.ts`에서 모아서 export한다.

```text
src/modules/{domain}/{domain}.schema.ts
src/config/database/schema.ts
```

## Migration

기본 흐름은 schema 수정 후 migration을 생성하고 적용하는 방식이다.

```bash
bun run db:generate
bun run db:migrate
```

- `db:generate`: schema 변경사항을 기반으로 migration SQL 생성
- `db:migrate`: 생성된 migration을 DB에 적용
- `db:push`: migration 없이 DB에 바로 반영하므로 신중히 사용
- `db:studio`: Drizzle Studio 실행

생성된 migration SQL은 적용 전에 확인한다. 컬럼 rename, 타입 변경, 데이터 이동이 필요한 변경은 자동 생성 결과가 의도와 다를 수 있다.

## 연결 확인

앱 시작 시 `DatabaseService`가 DB 연결을 확인한다.

정상 연결 로그:

```text
데이터베이스 연결이 완료되었습니다.
```

실패 로그:

```text
데이터베이스 연결에 실패했습니다: {error message}
```
