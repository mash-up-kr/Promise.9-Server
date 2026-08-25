# Database Operations

RDS 같은 managed DB를 쓰지 않기 때문에 snapshot이나 백업을 로컬에서 수동으로 관리할 수 있도록 DB 운영 보조 스크립트를 둔다.

## 전제 조건

- `.env` 또는 실행 환경에 `DATABASE_URL_DEVELOPMENT`, `DATABASE_URL_PRODUCTION`이 있어야 한다.
- 백업/검증/복구는 PostgreSQL client tools의 `pg_dump`, `pg_restore`를 사용한다.
- Lightsail 운영 DB 접속에는 OpenSSH client가 필요하다.
- 기본 접속 방식은 AWS CLI의 `promise9` profile과 유효한 `aws login --profile promise9`
  로그인이다.
- AWS CLI 로그인을 사용할 수 없을 때는 팀에서 안전하게 전달받은 Lightsail PEM 키를
  fallback으로 사용할 수 있다.
- 팀원의 일반 Lightsail shell 접속은 `bun run lightsail:ssh`를 사용한다.

## 명령어

| 목적                  | 명령어                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| 백업                  | `bun run db:backup -- --env=development`                                       |
| 백업 검증             | `bun run db:backup:verify -- --file=backups/database/example.dump`             |
| 복구                  | `bun run db:restore -- --env=development --file=backups/database/example.dump` |
| 상태 확인             | `bun run db:health -- --env=development`                                       |
| 운영 DB 터널(AWS CLI) | `bun run db:tunnel`                                                            |
| Mermaid ERD           | `bun run db:visualize_mermaid -- --env=development`                            |

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
연결한다. 로컬에서는 SSH 터널의 `127.0.0.1:15432`를 통해 접근한다.

### AWS CLI 임시 인증

다음 명령은 AWS CLI에서 인스턴스용 임시 SSH 접속 정보를 받은 뒤 터널을 연다.

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

### PEM 키 직접 인증

AWS CLI 로그인을 사용할 수 없고 팀에서 Lightsail PEM 키를 전달받았다면 OpenSSH로
같은 터널을 직접 열 수 있다. PEM 키는 repository 안에 복사하거나 커밋하지 않는다.

```bash
PROMISE9_PEM_PATH="$HOME/Downloads/LightsailDefaultKey-ap-northeast-2.pem"
chmod 600 "$PROMISE9_PEM_PATH"

ssh -N \
  -L 127.0.0.1:15432:127.0.0.1:5432 \
  -i "$PROMISE9_PEM_PATH" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  ubuntu@api.link-ding-dong.com
```

- `api.link-ding-dong.com`은 현재 Lightsail Instance의 Public IP를 직접 가리킨다. DNS가
  CDN이나 Load Balancer를 가리키도록 변경되면 Lightsail 콘솔의 현재 Public IP를 사용한다.
- 도메인 사용 자체가 IP 직접 입력보다 SSH 연결을 더 안전하게 만들지는 않는다. 서버
  신원은 SSH host key로 별도 검증한다.
- 최초 접속 때 표시되는 SSH host key fingerprint는 인프라 담당자에게 전달받은 값과
  일치할 때만 등록한다.
- host key가 기존 값과 달라졌다면 `known_hosts` 항목을 바로 삭제하지 말고 Instance
  교체 여부와 fingerprint를 먼저 확인한다.
- `Permission denied (publickey)`가 발생하면 PEM 키와 SSH 사용자 `ubuntu`가 현재
  Instance용인지 확인한다.
- `UNPROTECTED PRIVATE KEY FILE`이 발생하면 PEM 파일 권한을 `600`으로 변경한다.

터널을 연 터미널은 유지하고 다른 터미널에서 운영 DB 명령을 실행한다. 종료할 때는
터널 터미널에서 `Ctrl+C`를 누른다. pgAdmin으로 접속할 때는
[pgAdmin SSH Tunnel](./pgadmin-ssh-tunnel.md)을 따른다.

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
