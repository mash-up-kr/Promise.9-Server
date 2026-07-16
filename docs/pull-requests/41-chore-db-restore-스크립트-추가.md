# PR #41: [chore] DB restore 스크립트 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/41
- Author: @vcz-Chan
- Base: main
- Head: chore/db-restore
- Merged: 2026-07-16T10:31:58Z

## PR Body

## 📌 개요

DB 복구는 데이터 변경 가능성이 있어서 read-only 운영 스크립트 PR과 분리했습니다.

복구 파일 검증, 대화형 최종 확인, 현재 DB 백업을 먼저 수행한 뒤 `pg_restore`로 복구하는 `db:restore`를 추가합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `db:restore` 추가
- [x] 복구 실행 전 백업 파일 검증 추가
- [x] `Y`, `프로미스 나인` 대화형 안전 확인 추가
- [x] 복구 실행 전 현재 DB 자동 백업 추가
- [x] `--clean` 복구 확인 토큰 추가
- [x] 운영 DB 복구 보호 옵션 추가
- [x] DB 복구 문서 추가

## 💬 리뷰어에게

스크립트 추가 건이라 코드 전체를 빡세게 보기보다는 PR 본문만 봐주세요..

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### `db:restore`

`DATABASE_URL_DEVELOPMENT` 또는 `DATABASE_URL_PRODUCTION`이 가리키는 단일 PostgreSQL DB 전체를 복구하는 스크립트입니다. 특정 테이블만 선택해서 복구하는 옵션은 제공하지 않습니다.

```bash
bun run db:restore -- --env=development --file=backups/database/example.dump
```

동작 순서는 아래와 같습니다.

1. `--file`로 받은 `pg_dump custom archive`를 `pg_restore --list`로 검증합니다.
2. 대상 환경, DB, 복구 파일, 복구 방식, 복구 전 백업 위치를 보여줍니다.
3. `Y`를 정확히 입력해야 다음 확인으로 넘어갑니다.
4. `프로미스 나인`을 정확히 입력해야 실제 작업을 시작합니다.
5. 현재 대상 DB 전체를 `pg_dump --format custom`으로 백업합니다.
6. 현재 DB 백업이 성공한 경우에만 `pg_restore`를 실행합니다.
7. 복구는 `--single-transaction`으로 실행해 실패 시 부분 적용을 막습니다.

실행 전 확인은 아래처럼 표시됩니다.

```text
🚨 복구 실행 전 최종 확인
  - 잘못 실행하면 큰일나요!!
  - 이 작업은 대상 DB 데이터를 변경할 수 있습니다.
  - 복구 전에 현재 DB를 먼저 백업합니다.
  - 잘못 복구해도 이 스크립트가 만든 백업 파일로 다시 복구할 수 있습니다.

📌 실행 정보
  - 대상 환경: development (DATABASE_URL_DEVELOPMENT)
  - 대상 DB: promise9
  - 복구 파일: /.../backups/database/example.dump
  - 복구 방식: --clean 없이 복구
  - 복구 전 백업 위치: /.../backups/database/pre-restore/....dump

❓ 진짜 실행할 건가요? 계속하려면 Y를 입력하세요:
👥 우리팀 맞죠? 우리팀 이름은?:
```

복구 전 현재 DB 백업은 기본적으로 아래 위치에 저장됩니다.

```text
backups/database/pre-restore
```

현재 DB 백업 중 오류가 발생하면 실제 복구는 실행하지 않습니다. 잘못 복구한 경우 이 백업 파일을 다시 `db:restore`에 전달해 복구할 수 있습니다.

### 기본 복구

기본 복구는 기존 객체를 drop하지 않고 백업 내용을 적용합니다.

대상 DB에 백업과 같은 schema, table, data가 이미 있으면 객체 중복이나 데이터 충돌로 실패할 수 있습니다. 실패 시 `--single-transaction`에 의해 해당 복구 작업은 롤백됩니다.

### `--clean` 복구

`--clean`은 대상 DB의 기존 객체를 drop한 뒤 복구합니다. 실수로 실행하지 않도록 환경별 확인 토큰이 필요합니다.

```bash
bun run db:restore -- --env=development --file=backups/database/example.dump --clean --confirm=RESTORE_DEVELOPMENT
```

- development: `--confirm=RESTORE_DEVELOPMENT`
- production: `--confirm=RESTORE_PRODUCTION`

토큰이 없거나 틀리면 백업 파일 검증, 대화형 확인, 현재 DB 백업, 실제 복구 전에 종료됩니다.

### 운영 DB 복구

운영 DB 복구는 아래 옵션을 모두 명시해야 합니다.

```bash
bun run db:restore -- --env=production --file=backups/database/example.dump --allow-production --confirm=RESTORE_PRODUCTION
```

- `--env=production`
- `--allow-production`
- `--confirm=RESTORE_PRODUCTION`
- 대화형 확인값 `Y`
- 팀 이름 `프로미스 나인`

### 문서

- `docs/database/restore.md`에 기본 복구, `--clean`, 운영 DB 복구 조건을 정리했습니다.
- `docs/database/operations.md`에 `db:restore` 명령과 안전 조건을 추가했습니다.

### 검증

- `bun run db:restore -- --help`
- `tsc --noEmit`
- Prettier check
- `bun run test -- --runInBand` (35개 통과)
- `bun run build`
- `Y`가 아니면 실제 작업 전에 중단되는지 확인
- 팀 이름이 `프로미스 나인`이 아니면 실제 작업 전에 중단되는지 확인
- DB에 연결하지 않는 대체 명령으로 대화형 확인 → 현재 DB 백업 → restore 실행 순서 확인

실제 개발/운영 DB에 대한 복구 성공 테스트는 데이터 변경을 피하기 위해 수행하지 않았습니다.
