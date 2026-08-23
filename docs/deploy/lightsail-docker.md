# Lightsail Docker Deployment

Promise.9 서버는 Docker image를 Docker Hub에 올리고, Lightsail에서 해당 image를 받아 실행한다.

## 구성

| 항목                  | 값                       |
| --------------------- | ------------------------ |
| API 도메인            | `api.link-ding-dong.com` |
| SSH 사용자            | `ubuntu`                 |
| API 컨테이너          | `promise9-api`           |
| PostgreSQL 컨테이너   | `promise9-db`            |
| Docker Hub repository | `promise9-server`        |

AWS와 Docker Hub는 팀 계정을 사용한다.

## 배포 흐름

배포는 PR이 `main` 브랜치에 merge될 때 GitHub Actions의 `Deploy To Lightsail` workflow로 자동 진행한다.
필요하면 같은 workflow를 `main` 브랜치에서 수동 실행할 수 있다.

```text
GitHub Actions
  -> lint/test
  -> Docker image build
  -> Docker Hub push
  -> Lightsail SSH
  -> PostgreSQL pull/up 및 health check
  -> API pull/up 및 health check
```

workflow는 `deploy-lightsail` concurrency group으로 한 번에 하나만 실행한다. DB와 API
컨테이너가 모두 health check를 통과해야 배포 step이 성공한다. migration은 이 흐름에
포함하지 않는다.

## 서버 상태

Lightsail 서버에는 다음을 설치했다.

```text
Docker Engine
Docker Compose plugin
Nginx
certbot
```

Nginx는 `api.link-ding-dong.com` 요청을 컨테이너의 `127.0.0.1:3000`으로 전달한다.

```text
Internet
  -> Nginx 80/443
  -> 127.0.0.1:3000
  -> promise9-api
  -> db:5432
  -> promise9-db
```

Nginx 설정 파일은 [deploy/nginx/promise9-api.conf](../../deploy/nginx/promise9-api.conf)에 둔다.

## 서버 파일과 데이터

workflow는 다음 파일을 `/opt/promise9`에 배치한다.

| 서버 경로                               | 생성 기준                    |
| --------------------------------------- | ---------------------------- |
| `/opt/promise9/docker-compose.prod.yml` | repository의 Compose 파일    |
| `/opt/promise9/.env`                    | 배포 workflow가 매 배포 생성 |
| `/opt/promise9/db.env`                  | 배포 workflow가 매 배포 생성 |
| `/opt/promise9/postgres-data`           | PostgreSQL data bind mount   |

`.env`와 `db.env`는 서버에서 `600` 권한을 사용한다. `postgres-data`는 배포 때 덮어쓰지
않으며 Instance 안의 운영 데이터이므로 별도 로컬 백업을 유지한다.

## 네트워크

Lightsail public firewall은 CDK의 `Promise9LightsailStack`에서 관리한다. 현재 포트와 변경
규칙은 [Lightsail Infrastructure](../infrastructure/lightsail.md)를 따른다.

`3000`, `5432`, `6379`는 외부에 열지 않는다.

## 운영 메모

- Docker image에는 `.env`를 포함하지 않는다.
- DB 데이터는 host의 `/opt/promise9/postgres-data`에 저장한다.
- PostgreSQL 18과 pgvector 0.8.6을 포함한 image를 고정해서 사용한다.
- DB 복구와 migration은 대상과 실행 결과를 확인하며 직접 수행한다.
- DB migration은 배포 workflow에서 자동 실행하지 않는다.
- DB 백업은 Lightsail Instance 외부에도 보관한다.
- 배포 후 72시간 이상 지난 미사용 Docker image를 정리한다.

## DB 운영

PostgreSQL은 public port를 열지 않는다. 개발자 PC에서 운영 DB를 확인하거나 백업,
migration, 복구할 때는 [Database Operations](../database/operations.md)의
`bun run db:tunnel`을 사용한다. migration 절차는 [Database Setup](../database/setup.md),
복구 절차는 [Database Restore](../database/restore.md)를 따른다.
