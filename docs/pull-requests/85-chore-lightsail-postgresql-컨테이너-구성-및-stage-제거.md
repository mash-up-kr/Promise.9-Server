# PR #85: [chore] Lightsail PostgreSQL 컨테이너 구성 및 Stage 제거

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/85
- Author: @vcz-Chan
- Base: main
- Head: chore/lightsail-postgres
- Merged: 2026-08-23T11:37:48Z

## PR Body

## 📌 개요

공유 Stage 배포 구성을 제거하고, 운영 Lightsail 한 대에서 API와 pgvector PostgreSQL을 Docker Compose로 함께 실행합니다.

운영 DB는 이미 초기화하고 개발 DB 백업을 복구한 `/opt/promise9/postgres-data`를 계속 사용합니다. 일반 배포는 API만 갱신하며 DB 컨테이너의 초기화·재생성·재시작을 수행하지 않습니다.

## 🏗️ 구성

```text
Internet
  → Nginx :443
  → promise9-api :3000
  → promise9_app
  → db:5432
  → promise9-db

Team shell access
  → aws login --profile promise9
  → bun run lightsail:ssh
  → temporary SSH key + certificate

Local DB operation
  → bun run db:tunnel
  → 127.0.0.1:15432
  → Lightsail SSH tunnel
  → 127.0.0.1:5432
  → promise9-db
```

## ✅ 변경 사항

### Lightsail PostgreSQL

- `pgvector/pgvector:0.8.6-pg18-bookworm` 서비스 추가
- `/opt/promise9/postgres-data` bind mount로 DB 데이터 영속화
- DB port를 Lightsail의 `127.0.0.1:5432`에만 bind
- PostgreSQL shared memory `256mb`, 종료 유예 `1m`, log rotation 설정
- 이미 초기화·복구된 운영 DB를 전제로 DB 초기화 환경변수 제거

### DB role 분리

- `promise9`: 초기화, migration, 복구용 관리자 role
- `promise9_app`: API 전용 제한 role
- `promise9_app`에 public schema의 기존 테이블 CRUD와 sequence 사용 권한 부여
- `promise9`이 생성하는 이후 테이블·sequence에도 같은 권한이 적용되도록 default privileges 구성
- API role의 superuser, role/DB 생성, replication, RLS 우회, schema 생성 권한 차단

### 배포 workflow

- 구성된 전체 DB connection URL을 API `.env`에 그대로 반영
- DB 비밀번호로 connection URL을 조립하는 로직 제거
- DB용 env 파일 생성·업로드 제거
- `docker compose pull api`와 `up --no-deps ... api`만 실행
- DB 초기화, role 관리, migration과 데이터 복구는 자동 실행하지 않음

### 팀 SSH 및 운영 DB 접속

- `bun run lightsail:ssh`로 Lightsail shell 접속
- `bun run db:tunnel`로 `127.0.0.1:15432` 운영 DB 터널 연결
- `aws lightsail get-instance-access-details`로 실행할 때마다 임시 SSH key와 certificate 조회
- Lightsail host key 검증 및 종료 시 임시 접속 파일 삭제
- 팀원은 개인 `promise9` profile을 사용하며 default key pair와 공유 PEM 파일은 사용하지 않음
- 로컬 운영 작업은 관리자 role, API는 제한 role 사용

### 제거 및 문서 정리

- Stage GitHub Actions workflow 제거
- Stage Docker Compose와 Nginx 설정 제거
- Stage 운영 가이드 제거
- README, Lightsail 배포, DB setup/backup/restore/migration, AWS CLI, pgvector 문서를 현재 구성에 맞게 갱신

## 🔧 자동화하지 않은 범위

- 애플리케이션 소스, Drizzle schema, migration 파일은 변경하지 않음
- 배포 중 DB migration 또는 초기 데이터 복구를 실행하지 않음
- 빈 DB를 자동 초기화하거나 API 전환을 차단하는 로직을 추가하지 않음
- 로컬 DB 비밀번호나 `.env`를 SSH 스크립트가 생성·수정하지 않음

## 🚚 운영 반영 상태

- Lightsail의 Stage 컨테이너와 active Nginx 설정 정리 완료
- `promise9-db`에서 PostgreSQL 18.6, pgvector 0.8.6 확인
- 개발 DB 백업을 운영 DB 초기 데이터로 복구 완료
- 제한된 `promise9_app` role 생성 및 기존 8개 테이블 CRUD 권한 검증 완료
- 운영 API를 `promise9_app@db:5432` 연결로 전환하고 외부 health endpoint `200` 확인
- API 전환 전후 DB start time 유지 및 DB container 무중단 확인
- 사용하지 않는 서버 DB env 파일과 배포 변수 제거
- Lightsail public firewall은 `22`, `80`, `443`만 허용하며 DB public port는 닫힌 상태

## 🔍 리뷰 포인트

- `/opt/promise9/postgres-data:/var/lib/postgresql` mount 경로가 PostgreSQL 18 image와 맞는지
- API-only 배포에서 `--no-deps`로 DB 생명주기를 분리한 방식이 적절한지
- 관리자와 API role의 권한 분리가 적절한지
- 팀원 수동 접속을 개인 AWS CLI 임시 SSH 인증으로 통일한 방식이 적절한지
- 운영 DB의 public port 차단 및 임시 SSH 터널 방식이 적절한지
- migration·복구를 배포 workflow와 분리한 운영 방식이 적절한지

## 🧪 검증

- Docker Compose config 확인
- GitHub Actions YAML parse 확인
- ESLint 및 TypeScript build 통과
- Jest `24 suites / 142 tests` 통과
- `bun run lightsail:ssh` 실제 shell 접속 및 `exit` 종료 확인
- 실제 SSH 터널에서 `127.0.0.1:15432` PostgreSQL 응답 확인
- `promise9_app` 실제 로그인 및 제한 권한 확인
- 운영 API health `200`, DB `promise9_app` connection 확인
- DB start time 유지 및 서버의 불필요한 DB env 파일 제거 확인
- GitHub Actions CI 통과

## 🔗 관련 이슈

없음
