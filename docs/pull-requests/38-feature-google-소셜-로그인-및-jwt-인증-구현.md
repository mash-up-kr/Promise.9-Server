# PR #38: [feature] Google 소셜 로그인 및 JWT 인증 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/38
- Author: @hyoinkang
- Base: main
- Head: feat/google-auth
- Merged: 2026-07-13T11:29:55Z

## PR Body

## 📌 개요
프론트에서 Google SDK로 발급한 idToken을 서버에서 검증하고 자체 JWT를 발급하는 소셜 로그인을 구현합니다.
추후 Kakao 등 다른 소셜 로그인 추가를 고려한 확장 가능한 구조로 설계했습니다.

## ✅ 작업 내용 및 변경 사항
- [x] users, social_accounts, refresh_tokens DB 스키마 정의 및 migration 생성
- [x] Google idToken 검증 (google-auth-library)
- [x] 자체 JWT 발급 (accessToken + refreshToken) 및 Refresh Token Rotation 적용
- [x] 소셜 로그인 / 토큰 재발급 / 로그아웃 / 회원 탈퇴 엔드포인트 구현
- [x] JWT guard, CurrentUser 데코레이터 common으로 분리
- [x] Swagger Bearer 인증 추가

## 💬 리뷰어에게
- 늦어서 죄송합니당...ㅜㅠ
- 소셜 프로바이더는 `SocialProvider` 인터페이스 + provider 맵 구조로 Kakao 추가 시 파일 하나만 추가하면 되도록 했습니다.
- 온보딩 플로우 중간에 프로세스 추가될 수도 있을 것 같아서 passport는 JWT guard 용도로만 사용하고 소셜 검증은 직접 구현했습니다.
- 탈퇴 시에 소셜로그인 revoke 해서 연결 끊는 부분은 프론트와 구현 방식에 대한 상의가 필요할 것 같아서 추후에 붙일 것 같습니다.

그리고 환경변수 추가가 필요합니다! 옛날에 만들어뒀던 구글 클라이언트가 있어서 로컬에서는 그거랑 oauth playground로 테스트 했는데, 머지하기 전에 프로미스나인 계정으로 클라이언트 만들어서 전달드리겠습니다.
```
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

## 🔗 관련 이슈
close #

## 🔍 상세 내용
**인증 플로우**
1. 프론트에서 Google SDK로 idToken 발급
2. `POST /auth/social { provider, idToken }` 으로 서버 전달
3. google-auth-library로 idToken 검증 (Google 공개키 기반, 서버→Google 요청 없음)
4. social_accounts 조회 → 신규면 users + social_accounts 생성
5. accessToken(15m) + refreshToken(30d) 발급 및 응답
