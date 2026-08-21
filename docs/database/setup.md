# Database Setup

이 프로젝트는 PostgreSQL과 Drizzle ORM을 사용한다.

<br>

## 환경변수

`APP_ENV` 값에 따라 사용할 DB URL이 결정된다.

| APP_ENV | 사용 환경변수 |
| --- | --- |
| `development` | `DATABASE_URL_DEVELOPMENT` |
| `production` | `DATABASE_URL_PRODUCTION` |

`APP_ENV`를 지정하지 않으면 `development`로 동작한다.

<br>

## pgvector 확장

`links.embedding`이 `vector(768)` 타입이라 **pgvector 확장이 설치된 Postgres가 필요하다.** 확장을 켜는 것은 마이그레이션 `0005`가 하지만(`CREATE EXTENSION IF NOT EXISTS vector`), 확장 파일이 서버에 없으면 이 문장부터 실패한다.

| 증상 | 원인 |
| --- | --- |
| `could not open extension control file ... vector.control` | 서버에 pgvector가 설치되지 않음 |
| `type "vector" does not exist` | 확장이 켜지지 않음 |

로컬은 확장이 포함된 이미지로 컨테이너를 띄운다.

```bash
docker run -d --name promise9-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=promise9 \
  -p 5432:5432 pgvector/pgvector:pg18
```

기본 `postgres` 이미지로 이미 만들어 뒀다면 컨테이너를 교체해야 한다. 벡터 컬럼과 코사인 계산을 검색이 어떻게 쓰는지는 [벡터 검색 구조](../search/link-vector-search.md)를 참고한다.

운영은 `docker-compose.prod.yml`의 `pgvector/pgvector:0.8.6-pg18-bookworm` 이미지를
사용한다. PostgreSQL 18부터 컨테이너 데이터 경로가 `/var/lib/postgresql`로 바뀌므로,
Lightsail의 `/opt/promise9/postgres-data`를 해당 경로에 mount한다. `5432`는
`127.0.0.1`에만 bind하며 Lightsail public firewall에는 열지 않는다.

<br>

## Schema

도메인별 schema를 정의하고, `src/config/database/schema.ts`에서 모아서 export한다.

```text
src/modules/{domain}/{domain}.schema.ts
src/config/database/schema.ts
```

<br>

## Drizzle 명령어

| 명령어 | 하는 일 | DB 접속 | migration 파일 |
| --- | --- | --- | --- |
| `bun run db:generate` | `schema.ts`를 읽어 migration SQL 생성 (`drizzle/*.sql` + `meta`) | 안 함 | 생성 |
| `bun run db:migrate` | `drizzle/`의 migration 파일을 DB에 순서대로 적용 | 함 | 적용 |
| `bun run db:push` | `schema.ts`를 DB에 직접 반영 (migration 파일 없이) | 함 | 안 씀 |
| `bun run db:studio` | 브라우저 GUI로 DB 조회/편집 | 함 | 무관 |

- `db:generate`: DB에 영향을 주지 않고 파일만 만든다. 결과물(`drizzle/*.sql`, `meta`)은 커밋해 팀·배포 환경이 공유한다.
- `db:migrate`: 적용 이력을 `__drizzle_migrations` 테이블로 추적해 아직 적용되지 않은 migration만 올린다. 운영/배포의 기본 경로.
- `db:push`: 빠르지만 이력이 남지 않고, 데이터 손실 위험이 있으면 프롬프트로 확인한다. 로컬 실험용으로만 권장한다.
- `db:studio`: `https://local.drizzle.studio` GUI로 데이터 확인·디버깅에 쓴다.

<br>

### 권장 흐름

```text
schema.ts 수정
  ├─ 로컬 빠른 실험:  db:push          → db:studio 로 확인
  └─ 정식 반영/배포:  db:generate      → migration SQL 생성 후 커밋
                      db:migrate       → DB에 적용 (로컬 검증 후 배포 환경에도)
```

- 한 DB에 `push`와 `migrate`를 섞어 쓰면 상태가 어긋날 수 있다. **로컬 실험은 `push`, 공유/배포는 `generate` + `migrate`** 로 일관되게 사용한다.
- 생성된 migration SQL은 적용 전에 확인한다. 컬럼 rename, 타입 변경, 데이터 이동이 필요한 변경은 자동 생성 결과가 의도와 다를 수 있다.

<br>

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
