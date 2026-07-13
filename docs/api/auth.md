# API 명세서 — 인증 (Auth)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md) · [사용자 API](./user.md)
>
> Base URL: `/api/v1`
>
> 인증이 필요 없는 엔드포인트 (소셜 로그인, 토큰 재발급)는 `Authorization` 헤더 불필요

## Provider 구현 상태

| Provider | 상태 | 설명                                                            |
| -------- | :--: | --------------------------------------------------------------- |
| Google   |  O   | ID token 검증과 로그인·가입 동작                                |
| Kakao    | TODO | 요청 enum만 열려 있으며 provider 검증 구현 전에는 `950004` 반환 |

---

## 인증 플로우

```
1. 프론트에서 Google SDK로 idToken 발급
   - 앱 (iOS / Android): expo-auth-session
   - 웹 (Expo Web): Google SDK 사용
   - Kakao SDK 연동은 TODO

2. idToken을 서버로 전달
   - POST /auth/social { provider, idToken }

3. 서버에서 idToken 검증
   - 현재 Google OIDC 검증
   - Kakao provider 검증은 TODO
   - SOCIAL_ACCOUNTS 테이블에서 provider + provider_user_id로 유저 조회
   - 신규 유저면 USERS + SOCIAL_ACCOUNTS 생성

4. 자체 JWT 발급
   - accessToken + refreshToken 발급
   - refreshToken REFRESH_TOKENS 테이블에 저장
   - 응답 본문으로 반환

5. 토큰 저장은 클라이언트에서 처리
   - 앱: expo-secure-store
   - 웹: 프론트 결정
```

---

## DB 구조

테이블 설계는 [docs/database/tables](../database/README.md#테이블-설계)를 참조한다.

- [users](../database/tables/users.md)
- [social_accounts](../database/tables/social_accounts.md)
- [refresh_tokens](../database/tables/refresh_tokens.md)

---

## 토큰 정책

| 항목                   | 내용                                |
| ---------------------- | ----------------------------------- |
| 발급 방식              | 자체 JWT                            |
| accessToken 만료 시간  | 상수 관리 (추후 확정)               |
| refreshToken 만료 시간 | 상수 관리 (추후 확정)               |
| refreshToken 저장      | REFRESH_TOKENS 테이블               |
| Refresh Token Rotation | 재발급 시 기존 토큰 폐기, 신규 발급 |

---

## 엔드포인트

### 소셜 로그인

```
POST /auth/social
```

**Request Body**

```json
{
    "provider": "google",
    "idToken": "string"
}
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "accessToken": "string",
        "refreshToken": "string",
        "isNewUser": true
    }
}
```

> - `provider`: 소셜 로그인 제공자
> - `provider=google`: 현재 사용 가능
> - `provider=kakao`: 계약만 제공하는 TODO. 현재 요청하면 `400 Bad Request`, `errorCode=950004`
> - `idToken`: 클라이언트 SDK에서 발급받은 ID 토큰
> - `isNewUser`: 신규 가입 여부 (온보딩 처리용)

---

### 토큰 재발급

```
POST /auth/refresh
```

**Request Body**

```json
{
    "refreshToken": "string"
}
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "accessToken": "string",
        "refreshToken": "string"
    }
}
```

> Refresh Token Rotation 적용 — 재발급 시 기존 refreshToken 폐기, 신규 발급

---

### 로그아웃

```
POST /auth/logout
```

**Request Body**

```json
{
    "refreshToken": "string"
}
```

**Response `204`** No Content

> REFRESH_TOKENS 테이블에서 해당 토큰 삭제

---

### 회원 탈퇴

```
DELETE /auth/withdraw
```

**Request Body**

```json
{
    "refreshToken": "string"
}
```

**Response `204`** No Content

> - REFRESH_TOKENS 테이블에서 해당 유저의 토큰 전체 삭제
> - SOCIAL_ACCOUNTS 삭제
> - USERS soft delete (`deleted_at` 업데이트)
> - 소셜 토큰 revoke 처리 방식은 추후 프론트와 협의 필요
