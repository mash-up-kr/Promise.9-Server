# Database Operations

RDS 같은 managed DB를 쓰지 않기 때문에 snapshot이나 백업을 로컬에서 수동으로 관리할 수 있도록 DB 운영 보조 스크립트를 둔다.

## 전제 조건

- `.env` 또는 실행 환경에 `DATABASE_URL_DEVELOPMENT`, `DATABASE_URL_PRODUCTION`이 있어야 한다.
- 백업/검증/복구는 PostgreSQL client tools의 `pg_dump`, `pg_restore`를 사용한다.
- Lightsail 운영 DB 접속에는 AWS CLI의 `promise9` profile과 OpenSSH client가 필요하다.
- `aws login --profile promise9` 로그인이 유효해야 한다.
- 팀원의 일반 Lightsail shell 접속은 `bun run lightsail:ssh`를 사용한다.

## 명령어

| 목적                | 명령어                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| 백업                | `bun run db:backup -- --env=development`                                       |
| 백업 검증           | `bun run db:backup:verify -- --file=backups/database/example.dump`             |
| 복구                | `bun run db:restore -- --env=development --file=backups/database/example.dump` |
| 상태 확인           | `bun run db:health -- --env=development`                                       |
| 운영 DB 터널        | `bun run db:tunnel`                                                            |
| 마스터 폴더 배포    | `bun run db:distribute:master-folder -- --help`                                |
| 마스터 DB 간 동기화 | `bun run db:sync:master-links -- --help`                                       |
| Mermaid ERD         | `bun run db:visualize_mermaid -- --env=development`                            |

`--env`를 지정하지 않으면 `APP_ENV`를 사용하고, 없으면 `development`로 동작한다.
백업 기본 저장 위치는 `backups/database`이며 `.gitignore` 대상이다.

## 예시

```bash
bun run db:backup -- --env=development --sslmode=require
bun run db:backup:verify -- --file=backups/database/dev.dump
bun run db:restore -- --env=development --file=backups/database/dev.dump
bun run db:restore -- --env=development --file=backups/database/dev.dump --clean --confirm=RESTORE_DEVELOPMENT
bun run db:health -- --env=development
bun run db:visualize_mermaid -- --env=development
```

## Lightsail 운영 DB 접속

운영 PostgreSQL은 외부에 공개하지 않고 Lightsail 내부의 `127.0.0.1:5432`에만
연결한다. 다음 명령은 AWS CLI에서 인스턴스용 임시 SSH 접속 정보를 받은 뒤 로컬
`127.0.0.1:15432`로 터널을 연다.

```bash
bun run db:tunnel
```

터널을 연 터미널은 그대로 두고, 다른 터미널에서 운영 DB 명령을 실행한다.
`DATABASE_URL_PRODUCTION`의 host와 port는 `127.0.0.1:15432`를 사용해야 한다.
로컬 운영 명령은 관리자 role `promise9`을 사용한다. API 컨테이너는 별도의 제한된
`promise9_app` role을 사용한다. 로컬 `.env`는 git ignore 대상이며 권한을 `600`으로
제한한다.

```dotenv
DATABASE_URL_PRODUCTION=postgresql://promise9:<password>@127.0.0.1:15432/promise9
```

```bash
chmod 600 .env
```

```bash
bun run db:health -- --env=production
bun run db:backup -- --env=production --sslmode=disable
bun run db:backup:verify -- --file=backups/database/example.dump
```

터널은 `Ctrl+C`로 종료한다. 임시 private key, SSH certificate, host key 파일은
OS 임시 디렉터리에 만들고 터널 종료 시 삭제한다. 기본값은 다음 환경변수로 덮어쓸
수 있다.

| 환경변수                  | 기본값           |
| ------------------------- | ---------------- |
| `AWS_PROFILE`             | `promise9`       |
| `AWS_REGION`              | `ap-northeast-2` |
| `LIGHTSAIL_INSTANCE_NAME` | `Ubuntu-1`       |
| `LIGHTSAIL_DB_LOCAL_PORT` | `15432`          |

스크립트는 `aws lightsail get-instance-access-details`로 실행할 때마다 인스턴스용 임시
SSH 접속 정보를 받는다. 장기 PEM 파일을 프로젝트에 저장하지 않으며, AWS CLI가 반환한
private key와 certificate도 출력하지 않는다. AWS 로그인이 만료됐다면 다시 로그인한다.
터널 스크립트는 DB 비밀번호를 만들거나 로컬 `.env`를 수정하지 않는다.

```bash
aws login --profile promise9
```

## 마스터 링크 배포

상세 정책과 단계별 운영 절차는
[마스터 링크 배포](./master-link-distribution.md)를 참고한다.

UT용 링크는 마스터 계정의 실제 폴더에 먼저 저장해 요약·태그·임베딩 생성을 완료한다.
이후 폴더 단위 배포 스크립트로 같은 DB 환경의 대상 유저에게 복제한다.

```bash
# dry-run
bun run db:distribute:master-folder -- \
  --env=production \
  --folder-name="2차 UT" \
  --target-user-email="user@example.com"

# 실제 반영
bun run db:distribute:master-folder -- \
  --env=production \
  --folder-name="2차 UT" \
  --target-user-email="user@example.com" \
  --apply \
  --force-production
```

- 원본은 `MASTER_USER_ID`가 소유한 활성 폴더여야 한다.
- 대상 유저는 미리 존재해야 하며 `--target-user-id` 또는 `--target-user-email`로 지정한다.
- 대상에 동명 폴더가 있으면 재사용하고, 없으면 같은 이름·색상으로 생성한다.
- 링크의 URL·수집 메타데이터·AI 요약·임베딩과 모든 태그를 복사한다.
- 즐겨찾기·조회 시각·메모·리마인더 같은 유저 상태는 복사하지 않는다.
- 대상 유저의 활성 중복 URL은 덮어쓰거나 이동하지 않고 건너뛴다.
- 요약 또는 임베딩이 완료되지 않은 원본 링크가 하나라도 있으면 중단한다.
- 실제 삽입은 한 트랜잭션으로 처리하며 기본 실행은 변경 없는 dry-run이다.

개발 마스터의 모든 활성 폴더와 미분류 링크를 운영 마스터로 동기화하는 명령은
별도 운영 작업에만 사용한다. 운영 마스터는 개발 마스터와 같은 이메일로 찾는다.

```bash
# dry-run
bun run db:sync:master-links

# 실제 반영
bun run db:sync:master-links -- --apply --force-production
```

## 운영 환경 주의사항

- 운영 DB 대상 실행은 `--env=production` 여부를 먼저 확인한다.
- 관리자 role 비밀번호 변경과 API connection URL 변경은 같은 운영 작업으로 처리한다.
- 백업은 읽기 작업이지만 DB 전체를 읽으므로 부하가 생길 수 있다.
- 백업 완료 후 `db:backup:verify`로 archive를 확인하고 Lightsail Instance 외부에 보관한다.
- 복구는 데이터 변경 작업이므로 백업 파일 검증과 현재 DB 백업 후 실행된다.
- 복구 전에는 `Y`와 `프로미스 나인` 대화형 확인이 필요하다.
- `--clean` 복구는 `--confirm=RESTORE_DEVELOPMENT` 또는 `--confirm=RESTORE_PRODUCTION`이 필요하다.
- 운영 DB 복구는 `--allow-production --confirm=RESTORE_PRODUCTION`이 필요하다.
- 복구 상세 사용법은 [Restore](./restore.md)를 확인한다.
