# PR Stage Deployment

PR의 변경사항을 운영 서버와 동일한 Lightsail의 공유 Stage 컨테이너에 배포한다.

## 구성

| 항목          | 값                                              |
| ------------- | ----------------------------------------------- |
| Stage 도메인  | `stage-api.link-ding-dong.com`                  |
| Swagger       | `https://stage-api.link-ding-dong.com/api-docs` |
| 서버 경로     | `/opt/promise9-stage`                           |
| 컨테이너 이름 | `promise9-stage-api`                            |
| 호스트 포트   | `127.0.0.1:3001`                                |
| 컨테이너 포트 | `3000`                                          |
| 메모리 제한   | `512m`                                          |
| 데이터베이스  | 개발 DB                                         |

Stage는 하나의 공유 환경이다. 새 PR을 배포하면 기존 Stage 컨테이너가 새 이미지로 교체된다.

```text
PR 본문 또는 코멘트에 배포 키워드 추가
  -> 요청자 권한과 PR 출처 확인
  -> PR HEAD SHA checkout
  -> lint/test/build
  -> Docker Hub에 stage-pr-<PR 번호>-<SHA> 이미지 push
  -> Lightsail의 promise9-stage-api 교체
  -> health check
  -> PR에 Swagger 주소와 commit SHA 코멘트
  -> 모든 미사용 로컬 Stage 이미지 제거
```

## 배포 요청

PR 본문 또는 일반 코멘트에 독립된 단어로 `@stage`를 추가한다.

- PR 본문은 `opened`, `edited`, `synchronize`, `reopened` 이벤트에서 확인한다.
- 본문에 키워드가 남아 있으면 새 commit을 push할 때 다시 배포한다.
- PR 코멘트는 `created`, `edited` 이벤트에서 확인한다.
- 저장소에 `write`, `maintain`, `admin` 권한이 있는 사용자만 요청할 수 있다.
- Fork에서 생성한 PR과 닫힌 PR은 배포하지 않는다.

`issue_comment` workflow는 workflow 파일이 기본 브랜치에 존재할 때만 실행된다. 최초 도입 PR에서는 PR 본문의 키워드로 배포를 확인하고, workflow가 `main`에 반영된 뒤부터 코멘트 요청을 사용한다.

배포가 완료되면 요청한 PR에 Swagger 주소, 배포 commit SHA, workflow 실행 링크를 기록한다. 코멘트에는 다른 PR 배포로 교체될 수 있는 공유 환경이라는 안내를 포함한다.

## GitHub Actions 설정

GitHub repository에 `stage` Environment를 만들고 다음 애플리케이션 Secret을 등록한다.

### 필수 Secret

| 이름                       | 용도                                  |
| -------------------------- | ------------------------------------- |
| `DATABASE_URL_DEVELOPMENT` | Lightsail에서 접근 가능한 개발 DB URL |
| `JWT_ACCESS_SECRET`        | Stage Access Token 서명 키            |
| `JWT_REFRESH_SECRET`       | Stage Refresh Token 서명 키           |
| `GOOGLE_CLIENT_ID`         | Google ID Token 검증용 Client ID      |

Workflow는 Stage 환경파일에 `APP_ENV=development`를 직접 기록한다. `DATABASE_URL_DEVELOPMENT`에 `localhost`를 사용하면 컨테이너 자신을 가리키므로 외부에서 접근 가능한 DB 주소를 등록해야 한다.

### 선택 Secret

| 이름                     | 용도                          |
| ------------------------ | ----------------------------- |
| `JWT_ACCESS_EXPIRES_IN`  | Access Token 만료 시간        |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 만료 시간       |
| `MASTER_ACCESS_TOKEN`    | Stage 테스트용 마스터 토큰    |
| `MASTER_USER_ID`         | 마스터 토큰 사용자 ID         |
| `DB_POOL_SIZE`           | Stage DB connection pool 크기 |

Docker Hub와 Lightsail 배포에는 운영 배포에서 사용하는 다음 repository Secret을 재사용한다.

```text
DOCKERHUB_USERNAME
DOCKERHUB_REPOSITORY
DOCKERHUB_TOKEN
LIGHTSAIL_HOST
LIGHTSAIL_USERNAME
LIGHTSAIL_SSH_KEY
LIGHTSAIL_PORT
```

## Nginx와 HTTPS 설정

DNS A record는 다음과 같이 Lightsail static IP를 가리켜야 한다.

```text
stage-api.link-ding-dong.com -> 52.78.189.19
```

서버에 [promise9-stage-api.conf](../../deploy/nginx/promise9-stage-api.conf)를 전달한 뒤 다음과 같이 활성화한다.

```bash
sudo cp promise9-stage-api.conf /etc/nginx/sites-available/promise9-stage-api.conf
sudo ln -s /etc/nginx/sites-available/promise9-stage-api.conf /etc/nginx/sites-enabled/promise9-stage-api.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d stage-api.link-ding-dong.com
```

이미 symbolic link가 존재한다면 `ln -s`는 다시 실행하지 않는다. certbot 실행 후 `sudo nginx -t`로 설정을 다시 검증한다.

Stage 포트 `3001`은 `127.0.0.1`에만 bind하므로 Lightsail firewall에 추가하지 않는다.

## DB migration

Stage 배포 workflow는 DB migration을 실행하지 않는다. 스키마 변경 PR을 검증해야 한다면 개발 DB migration을 수동으로 적용한 뒤 배포한다.

## 이미지 정리

Stage 이미지는 `com.promise9.environment=stage` label을 포함한다. 새 컨테이너가 health check를 통과한 뒤 이 label이 있는 모든 미사용 로컬 이미지를 제거한다. 현재 실행 중인 Stage 이미지와 label이 없는 운영 이미지에는 영향을 주지 않는다.
