# PR #53: [chore] 머지 전 협업을 위한 PR Stage 자동 배포 구성

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/53
- Author: @vcz-Chan
- Base: main
- Head: chore/stage-deploy
- Merged: 2026-07-17T02:33:57Z

## PR Body

## 📌 개요

메인 브랜치에 머지되기 전 프론트엔드 연동, 팀 단위 통합 테스트, 기능 공유를 위한 공용 Stage 배포 환경을 추가합니다.

PR 생성 시 본문에 `@stage`를 포함하거나, PR 작성자 또는 저장소 write 권한 이상 팀원이 새 코멘트로 `@stage`를 남기면 해당 PR의 최신 커밋을 `https://stage-api.link-ding-dong.com`에 배포합니다.

## ✅ 작업 내용 및 변경 사항

- [x] 공용 Stage용 Docker Compose 구성 추가
- [x] `stage-api.link-ding-dong.com` Nginx reverse proxy 구성 추가
- [x] PR 본문 및 코멘트의 `@stage`를 감지하는 GitHub Actions 추가
- [x] PR 작성자 권한, PR 상태, 동일 저장소 브랜치 검증 추가
- [x] Stage 배포 완료 시 Swagger 주소와 배포 커밋을 PR 코멘트로 안내
- [x] 새 배포가 정상 기동된 뒤 이전 Stage 로컬 이미지를 정리
- [x] Stage 배포 및 운영 가이드 문서화

## 💬 리뷰어에게

- 이 PR은 `docs/api-screen-mapping` 위에 쌓은 Stack PR입니다.
- Stage는 PR별 인스턴스가 아니라 최신 요청이 기존 인스턴스를 교체하는 하나의 공유 환경입니다.
- Stage 애플리케이션은 `APP_ENV=development`로 실행하며 `DATABASE_URL_DEVELOPMENT`를 사용합니다.
- DB migration은 자동 실행하지 않고 수동으로 유지합니다.
- 같은 저장소의 write 권한 이상 사용자만 배포를 요청할 수 있습니다. 해당 신뢰 범위 안에서 PR 브랜치의 workflow가 repository secrets를 사용하는 현재 방식을 적용했습니다.
- 첫 실행은 아래 PR 본문의 `@stage`로 시작되며, 이후에는 코멘트에 `@stage`만 남겨 다시 배포할 수 있습니다.
- 컨테이너는 서버의 `127.0.0.1:3001`에만 노출되고 Nginx를 통해 접근합니다.

## 🔗 관련 이슈

- 해당 없음

## 🔍 상세 내용

### 도입 목적

- 백엔드 변경을 머지하기 전에 프론트엔드가 실제 API와 연동해 확인
- 팀원이 동일한 Swagger 및 API 환경을 보며 통합 테스트
- PR 변경 사항을 로컬 설정 없이 공유하고 빠르게 피드백

### 사용 가이드

1. PR 생성 당시 본문에 독립된 `@stage`가 있으면 배포되며, 본문에 키워드가 남아 있으면 새 커밋 push 시 최신 버전으로 다시 배포됩니다.
2. PR 생성 후 배포를 요청하려면 새 코멘트에 독립된 `@stage`를 작성합니다. PR 본문이나 기존 코멘트 수정만으로는 배포되지 않습니다.
3. 배포가 성공하면 봇이 Swagger 주소, 배포 PR/커밋, Actions 실행 링크를 PR 코멘트로 안내합니다.
4. 공유 인스턴스이므로 다른 PR에서 배포하면 현재 Stage가 해당 PR 버전으로 교체됩니다.
5. 성공 코멘트가 달리지 않으면 GitHub Actions의 `Deploy PR to Stage` 실행 로그를 확인합니다.

### 배포 흐름

`@stage` 감지 → 요청자/PR/브랜치 검증 → lint/test/build → Docker image push → Lightsail 배포 → health check → 이전 Stage image 정리 → PR 성공 코멘트

### Stage 설정

| 항목 | 값 |
| --- | --- |
| API | https://stage-api.link-ding-dong.com |
| Swagger | https://stage-api.link-ding-dong.com/api-docs |
| DB | Dev DB (`DATABASE_URL_DEVELOPMENT`) |
| migration | 수동 |
| 컨테이너 메모리 제한 | 512 MiB |
| 운영 방식 | 공유 인스턴스, 최신 배포로 교체 |

### 서버 가용 자원 확인

배포 전 idle 시점 기준입니다.

| 항목 | 확인 결과 |
| --- | --- |
| 메모리 | 총 1.9 GiB / 사용 573 MiB / 가용 1.3 GiB |
| Swap | 없음 |
| 디스크 | 총 58 GiB / 사용 3.5 GiB / 가용 54 GiB (7% 사용) |
| Docker image | 673.6 MB / 회수 가능 222 MB |
| 운영 API 메모리 | 62.73 MiB |
| Docker Compose | v5.2.0 |

현재 측정치 기준으로 운영 API와 512 MiB 제한의 Stage를 함께 실행할 여유가 있습니다. 다만 Swap이 없으므로 실제 Stage 부하와 서버 메모리는 배포 후에도 확인해야 합니다.

### 주의사항

- Stage는 공용 환경이므로 테스트 전에 PR 성공 코멘트의 배포 PR 번호와 커밋을 확인합니다.
- Dev DB를 공유하므로 테스트 데이터 충돌과 파괴적인 작업에 주의합니다.
- 현재 PR에서 workflow를 처음 도입하므로 이 PR에서의 최초 실행 결과까지 확인한 뒤 머지합니다.

@stage
