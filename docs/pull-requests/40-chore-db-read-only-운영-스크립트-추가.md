# PR #40: [chore] DB read-only 운영 스크립트 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/40
- Author: @vcz-Chan
- Base: main
- Head: chore/db-scripts
- Merged: 2026-07-16T10:31:01Z

## PR Body

## 📌 개요
RDS 같은 managed DB를 사용하지 않아 snapshot이나 백업을 로컬에서 수동으로 관리할 수 있도록 read-only DB 운영 스크립트를 추가했습니다.

이 PR에서는 개발/운영 DB URL을 환경에 따라 선택하고, 로컬에서 백업 생성, 백업 파일 검증, DB 상태 확인, Mermaid ERD 생성을 실행할 수 있게 합니다.

## ✅ 작업 내용 및 변경 사항
- [x] `db:backup` 스크립트 추가
- [x] `db:backup:verify` 스크립트 추가
- [x] `db:health` 스크립트 추가
- [x] `db:visualize_mermaid` 스크립트 추가
- [x] DB 환경 선택 및 PostgreSQL client 실행 공통 유틸 추가
- [x] 백업 산출물 `backups/` git ignore 처리
- [x] DB 운영 스크립트 사용 문서 추가

## 💬 리뷰어에게
스크립트 추가 건이라 코드 전체를 빡세게 보기보다는 PR 본문만 봐주세요..

## 🔗 관련 이슈
없음

## 🔍 상세 내용

### `db:backup`
선택한 환경의 DB를 로컬 백업 파일로 저장하는 스크립트입니다.

```bash
bun run db:backup -- --env=development
```

- `--env=development`이면 `DATABASE_URL_DEVELOPMENT`를 사용합니다.
- `--env=production`이면 `DATABASE_URL_PRODUCTION`을 사용합니다.
- `--env`가 없으면 `APP_ENV`를 보고, `APP_ENV`도 없으면 `development`로 동작합니다.
- 기본적으로 `pg_dump --format custom`으로 백업합니다.
- 기본 저장 위치는 `backups/database`입니다.
- 저장된 백업 파일은 `.gitignore` 대상입니다.
- `--output`, `--output-dir`, `--format`, `--sslmode`, `--sslrootcert`, `--pg-dump-path` 옵션을 지원합니다.

### `db:backup:verify`
백업 파일이 정상적인 PostgreSQL custom archive인지 검증하는 스크립트입니다.

```bash
bun run db:backup:verify -- --file=backups/database/example.dump
```

- `pg_restore --list`로 백업 파일 목차를 읽습니다.
- 백업 DB 이름, dump format, TOC entry 수를 출력합니다.
- 실제 DB에는 연결하지 않습니다.
- `--show-list` 옵션으로 `pg_restore --list` 전체 결과를 확인할 수 있습니다.
- `--pg-restore-path` 옵션으로 사용할 `pg_restore` 경로를 직접 지정할 수 있습니다.

### `db:health`
선택한 환경의 DB 연결 상태와 기본 metadata를 확인하는 스크립트입니다.

```bash
bun run db:health -- --env=development
```

- 현재 DB 이름, DB 사용자, PostgreSQL 버전, 현재 schema를 출력합니다.
- schema 목록과 지정 schema의 테이블 목록을 출력합니다.
- `drizzle.__drizzle_migrations` 존재 여부를 확인합니다.
- migration 테이블이 있으면 migration 개수와 마지막 `created_at`을 출력합니다.
- `--schema` 옵션으로 테이블 목록을 확인할 schema를 지정할 수 있습니다.

### `db:visualize_mermaid`
선택한 환경의 실제 DB metadata를 읽어서 Mermaid ERD 문서를 생성하는 스크립트입니다.

```bash
bun run db:visualize_mermaid -- --env=development
```

- `information_schema`에서 테이블, 컬럼, primary key, foreign key 정보를 조회합니다.
- 조회한 DB 구조를 Mermaid `erDiagram` 형식으로 변환합니다.
- 기본 출력 위치는 `docs/database/erd.md`입니다.
- `--output` 옵션으로 저장 위치를 바꿀 수 있습니다.
- `--schema` 옵션으로 조회할 schema를 지정할 수 있습니다.
- `--format=mermaid`로 Markdown 문서가 아니라 Mermaid 원문만 저장할 수 있습니다.

### 공통 동작
- 모든 DB 연결 스크립트는 `--env` 기준으로 사용할 DB URL을 선택합니다.
- 허용 환경은 `development`, `production`만 받습니다.
- 로그는 한국어로 출력합니다.
- PostgreSQL client tools가 필요한 스크립트는 로컬의 `pg_dump`, `pg_restore`를 사용합니다.

### 검증
- `bun run lint`
- `tsc --noEmit`
- `bun run test`
- `bun run build`
- Prettier check
- 각 DB 스크립트 `--help` 확인
- 개발 DB 기준 `db:backup`, `db:backup:verify`, `db:health`, `db:visualize_mermaid` smoke test
