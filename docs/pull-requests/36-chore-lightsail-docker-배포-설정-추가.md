# PR #36: [chore] Lightsail Docker 배포 설정 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/36
- Author: @vcz-Chan
- Base: main
- Head: chore/lightsail-docker-deploy
- Merged: 2026-07-08T10:26:15Z

## PR Body

## 📌 개요
Lightsail 기반 Docker 배포 구성을 추가합니다. GitHub Actions에서 Docker 이미지를 빌드해 Docker Hub에 push하고, Lightsail 서버에서는 SSH로 접속해 docker compose로 컨테이너를 갱신합니다.

## ✅ 작업 내용 및 변경 사항
- [x] Dockerfile, .dockerignore, docker-compose.prod.yml 추가
- [x] GitHub Actions CI workflow 추가
- [x] Lightsail 자동/수동 배포 workflow 추가
- [x] 배포 workflow 동시 실행 방지를 위한 concurrency 추가
- [x] Nginx 설정 파일과 배포 문서 추가
- [x] 기본 build script를 Nest CLI 대신 tsc 기반으로 변경

## 💬 리뷰어에게
- Docker Hub, AWS Lightsail, GitHub Actions secrets을 팀 계정으로 만들었습니다.
- 현재 DB migration은 배포 workflow에서 자동 실행하지 않습니다.
- 운영 환경변수는 Docker image에 포함하지 않고, 배포 시 서버의 /opt/promise9/.env로 반영합니다.
- 배포는 main 머지 시 자동으로 진행되며, 필요하면 main 브랜치에서 수동 실행할 수도 있습니다.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
배포는 PR이 main 브랜치에 merge될 때 Deploy To Lightsail workflow로 자동 진행됩니다. 필요하면 같은 workflow를 main 브랜치에서 수동 실행할 수 있습니다.

동일 Lightsail 서버의 /opt/promise9 경로를 갱신하므로, deploy job에는 `deploy-lightsail` concurrency group을 적용해 한 번에 하나의 배포만 실행되도록 했습니다. 이미 실행 중인 배포는 취소하지 않고 다음 배포가 대기합니다.

```text
GitHub Actions
  -> lint/test
  -> Docker image build
  -> Docker Hub push
  -> Lightsail SSH
  -> docker compose pull/up
```

Nginx는 api.link-ding-dong.com 요청을 127.0.0.1:3000으로 전달하고, 애플리케이션 컨테이너는 외부 DB에 연결합니다.
