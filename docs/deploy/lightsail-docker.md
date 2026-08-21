# Lightsail Docker Deployment

Promise.9 서버는 Docker image를 Docker Hub에 올리고, Lightsail에서 해당 image를 받아 실행한다.

## 현재 구성

| 항목                  | 값                       |
| --------------------- | ------------------------ |
| API 도메인            | `api.link-ding-dong.com` |
| Lightsail static IP   | `52.78.189.19`           |
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

## 네트워크

Lightsail public firewall은 CDK의 `Promise9LightsailStack`에서 관리한다. 현재 포트와 변경
규칙은 [Lightsail Infrastructure](../infrastructure/lightsail.md)를 따른다.

`3000`, `5432`, `6379`는 외부에 열지 않는다.

## 운영 메모

- Docker image에는 `.env`를 포함하지 않는다.
- GitHub repository의 `POSTGRES_PASSWORD` secret으로 API용 `.env`와 DB용 `db.env`를 만든다.
- DB 데이터는 host의 `/opt/promise9/postgres-data`에 저장한다.
- PostgreSQL 18과 pgvector 0.8.6을 포함한 image를 고정해서 사용한다.
- 최초 DB 복구와 migration은 대상과 실행 결과를 확인하며 직접 수행한다.
- DB migration은 현재 배포 workflow에서 자동 실행하지 않는다.
- DB 백업은 Lightsail Instance 외부에도 보관한다.
- 배포 후 72시간 이상 지난 미사용 Docker image를 정리한다.
