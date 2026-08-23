# PR #79: [feature] Kakao 웹 로그인용 code→idToken 교환 프록시 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/79
- Author: @hyoinkang
- Base: main
- Head: feature/kakao-web-token-proxy
- Merged: 2026-08-23T11:51:30Z

## PR Body

## 📌 개요

카카오 OIDC는 `response_type=code`로 고정돼 있어, 웹은 `client_secret` 노출 없이 idToken을 직접 받을 방법이 없습니다. `client_secret`을 서버에만 두고 code→idToken 교환을 대신해주는 프록시 엔드포인트를 추가합니다.

## ✅ 작업 내용 및 변경 사항

- [ ] `POST /auth/kakao/exchange` 추가
- [ ] `KAKAO_CLIENT_SECRET` 환경변수 추가

## 💬 리뷰어에게

- 네이티브 앱은 SDK가 idToken을 바로 주기 때문에 이 엔드포인트가 필요 없고, **웹에서만** 사용합니다.
- idToken까지만 반환하고 로그인 자체는 기존 `/auth/social`을 그대로 사용합니다.
- 로컬에서 전체 플로우대로 테스트 완료했습니다.

## 🔗 관련 이슈

N/A

## 🔍 상세 내용

**전체 플로우**

```
1. 프론트: 카카오 authorize URL로 리다이렉트 (response_type=code)
2. 카카오 → 프론트 redirect_uri로 ?code=... 전달
3. 프론트 → POST /auth/kakao/exchange { code, redirectUri }
4. 서버 → 카카오 token endpoint(https://kauth.kakao.com/oauth/token)와
   grant_type=authorization_code로 교환
   - client_secret은 서버 환경변수(KAKAO_CLIENT_SECRET)에서만 사용, 프론트엔 노출 안 됨
   - 교환 실패 시 400 (errorCode: 950005, KAKAO_EXCHANGE_FAILED)
5. 서버 → { idToken } 응답
6. 프론트 → POST /auth/social { provider: "kakao", idToken }  (기존 로그인 계약 그대로)
7. 서버 → { accessToken, refreshToken, isNewUser }
```

- redirectUri는 3번 요청과 카카오 콘솔에 등록된 Redirect URI가 정확히 일치해야 합니다.
- authorization code는 1회용이고 발급 후 짧은 시간 내 만료되므로, exchange 실패 시 2번부터 재시도해야 합니다.
- 네이티브 앱은 이 흐름을 타지 않고, SDK가 발급한 idToken으로 6번부터 바로 시작합니다.
