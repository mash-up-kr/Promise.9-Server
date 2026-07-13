# PR #46: [chore] 배포 캐시 제거 및 운영 환경변수 설정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/46
- Author: @vcz-Chan
- Base: main
- Head: agent/fix-deploy-cache-env
- Merged: 2026-07-13T12:03:46Z

## PR Body

## 📌 개요
Docker Buildx의 GitHub Actions 캐시 export 실패가 이미지 push 이후의 배포 단계를 중단시키는 문제를 해결합니다.
머지 기반 배포 조건은 유지하면서 사용 효과가 없고 쓰기 권한이 제한된 GitHub Actions 캐시를 제거하고, 인증 및 마스터 접근에 필요한 운영 환경변수를 배포 서버의 `.env` 파일에 명시적으로 전달합니다.

## ✅ 작업 내용 및 변경 사항
- [x] Docker Buildx의 GitHub Actions cache import/export 설정 제거
- [x] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`를 운영 환경변수에 연결
- [x] `MASTER_ACCESS_TOKEN`, `MASTER_USER_ID`를 운영 환경변수에 연결

## 💬 리뷰어에게
`pull_request: closed` 및 `merged == true` 조건을 유지하여 PR이 실제로 병합될 때만 배포합니다.
GitHub Actions에 등록된 애플리케이션용 Secret만 `.env.production`에 기록하며, Docker Hub 및 Lightsail SSH 관련 배포 인프라 Secret은 컨테이너 환경에 전달하지 않습니다.

## 🔗 관련 이슈
- 해당 없음

## 🔍 상세 내용
- 기존 workflow는 읽기 전용 GitHub Actions 캐시 토큰으로 cache export를 시도하면서 `failed to reserve cache` 오류가 발생했고, Docker Hub 이미지 push가 완료된 뒤에도 서버 배포 단계가 모두 건너뛰어졌습니다.
- 해당 workflow에서 `cache-from`과 `cache-to`를 제거하여 캐시 쓰기 실패가 배포에 영향을 주지 않도록 했습니다.
- `Create production env file` 단계에서 코드의 환경변수 스키마가 사용하는 인증 및 마스터 접근 Secret을 명시적으로 기록합니다.
- 검증: YAML 구문 검사, `git diff --check`, pre-commit 테스트 35개 통과
