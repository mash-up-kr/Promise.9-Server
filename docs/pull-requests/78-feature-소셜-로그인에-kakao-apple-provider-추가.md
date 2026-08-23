# PR #78: [feature] 소셜 로그인에 Kakao/Apple provider 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/78
- Author: @hyoinkang
- Base: main
- Head: feature/kakao-apple-social-login
- Merged: 2026-08-23T11:47:29Z

## PR Body

## 📌 개요

Google 소셜 로그인과 동일한 패턴으로 Kakao/Apple OIDC id_token 검증을 추가합니다. 기존 `SocialProvider` 인터페이스를 그대로 구현해 `/auth/social` 엔드포인트 하나로 세 provider를 모두 처리합니다.

## ✅ 작업 내용 및 변경 사항

- [ ] `KakaoProvider`, `AppleProvider` 추가
- [ ] `SUPPORTED_PROVIDERS`에 `apple` 추가
- [ ] `APPLE_CLIENT_ID`를 콤마 구분 복수 audience로 받아 iOS 네이티브(Bundle ID)·웹(Services ID) 동시 지원
- [ ] `KAKAO_CLIENT_ID`, `APPLE_CLIENT_ID` 환경변수 추가

## 💬 리뷰어에게

- Apple만 audience를 배열로 받는 이유: 네이티브/웹 플로우의 `aud`가 서로 달라서(Bundle ID vs Services ID)입니다.

## 🔗 관련 이슈

N/A

## 🔍 상세 내용

- 검증 완료
  - lint 통과
  - TypeScript 빌드 통과
  - 테스트 95개 통과
  - 로컬에서 카카오 및 애플 로그인 E2E 테스트 완료
