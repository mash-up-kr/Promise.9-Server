# Lightsail Docker Deployment

Promise.9 서버는 Docker image를 Docker Hub에 올리고, Lightsail에서 해당 image를 받아 실행한다.

## 현재 구성

| 항목                  | 값                       |
| --------------------- | ------------------------ |
| API 도메인            | `api.link-ding-dong.com` |
| Lightsail static IP   | `52.78.189.19`           |
| SSH 사용자            | `ubuntu`                 |
| 컨테이너 포트         | `3000`                   |
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
  -> docker compose pull/up
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
  -> promise9-api container
```

Nginx 설정 파일은 [deploy/nginx/promise9-api.conf](../../deploy/nginx/promise9-api.conf)에 둔다.

PR 단위 공유 Stage 배포는 [PR Stage Deployment](./stage-pr-deployment.md)에서 별도로 설명한다.

## 네트워크

Lightsail firewall은 다음 포트만 연다.

| 포트      | 용도  | Source           |
| --------- | ----- | ---------------- |
| `22/tcp`  | SSH   | 가능한 경우 제한 |
| `80/tcp`  | HTTP  | Anywhere         |
| `443/tcp` | HTTPS | Anywhere         |

`3000`, `5432`, `6379`는 외부에 열지 않는다.

## 운영 메모

- Docker image에는 `.env`를 포함하지 않는다.
- 운영 환경변수는 배포 중 `.env.production`으로 만들고 서버의 `/opt/promise9/.env`로 반영한다.
- PostgreSQL은 compose에 포함하지 않고 외부 DB를 사용한다.
- DB migration은 현재 배포 workflow에서 자동 실행하지 않는다.
- 배포 후 72시간 이상 지난 미사용 Docker image를 정리한다.
