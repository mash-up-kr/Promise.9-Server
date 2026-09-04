# PR #103: [feature] 웹 로그인 기반 익스텐션 토큰 발급 API 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/103
- Author: @hyoinkang
- Base: main
- Head: feature/extension-token
- Merged: 2026-09-01T11:00:44Z

## PR Body

## 📌 개요

익스텐션이 웹 로그인 페이지를 거쳐 인증한 뒤, 웹 access token으로 별도의 익스텐션 전용 토큰쌍을 발급받을 수 있는 API를 추가합니다. 웹과 독립된 `tokenFamily`로 발급되어 한쪽을 로그아웃해도 다른 쪽에는 영향이 없습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `POST /auth/extension-token` 추가 (웹 access token으로 인증)
- [x] 기존 `issueTokens`를 재사용해 새 `tokenFamily`로 발급 → 웹 세션과 독립적으로 회전/폐기
- [x] Swagger 문서화
- [x] refresh token에 `jti` 추가
- [x] 토큰에 `purpose`(primary/extension) claim 추가
- [x] `PrimaryAuthGuard` 추가

## 💬 리뷰어에게

리프레시토큰 스키마에 purpose를 추가해서 익스텐션 토큰 발급을 웹/앱 토큰에 대해서만 수행할 수 있도록 제한했습니다

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### 플로우

```text
익스텐션 → 웹 로그인 페이지 이동
→ 웹에서 로그인 완료 (웹 토큰쌍 발급)
→ 웹이 POST /auth/extension-token 호출 (Authorization: 웹 access token)
→ 새 tokenFamily로 별도 토큰쌍 발급
→ 웹이 익스텐션에 두 번째 토큰쌍 전달
```

### 로컬 테스트 완료

- `MASTER_ACCESS_TOKEN` 인증 우회로 검증
- `POST /auth/extension-token` 정상 발급 확인
- 동일 유저로 연달아 3회 호출 → 각각 다른 `tokenFamily`로 정상 삽입 (jti 수정 전에는 같은 초에 호출 시 500 재현됨)
- 발급받은 토큰쌍 중 하나를 `/auth/refresh`로 회전 → 이미 사용된 토큰 재사용 시 탈취로 감지되어 401, 그 사이 별도 family인 다른 토큰쌍은 영향 없이 정상 회전 (독립성 확인)
- `bun test` 159 pass, `tsc --noEmit` / `eslint` 클린
