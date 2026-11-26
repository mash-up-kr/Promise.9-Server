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

| 항목                   | 내용                                 |
| ---------------------- | ------------------------------------ |
| 발급 방식              | 자체 JWT                             |
| accessToken 만료 시간  | `JWT_ACCESS_EXPIRES_IN`, 기본 `15m`  |
| refreshToken 만료 시간 | `JWT_REFRESH_EXPIRES_IN`, 기본 `30d` |
| refreshToken 저장      | REFRESH_TOKENS 테이블                |
| Refresh Token Rotation | 재발급 시 기존 토큰 폐기, 신규 발급  |

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

> 재발급 시 사용한 refreshToken을 폐기하고 새 refreshToken을 발급한다.

---

### 로그아웃

```
POST /auth/logout
```

**Request Body**

```json
{
    "refreshToken": "string",
    "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Response `204`** No Content

> - `refreshToken`은 필수다. 서명·토큰 용도·사용자 ID를 검증하며, 로그아웃에서만 만료를 허용한다. 재발급과 회원 탈퇴는 기존처럼 만료를 검사한다.
> - `pushToken`은 선택이다. 올바른 Expo Push Token이면 앞뒤 공백을 제거한 뒤 리프레시 토큰의 사용자 ID와 토큰을 함께 조건으로 삭제한다. 다른 계정으로 연결된 토큰이나 다른 기기의 토큰은 삭제하지 않는다.
> - `pushToken`이 없거나 형식이 잘못되면 푸시 토큰 삭제만 건너뛰고 로그아웃을 진행한다.
> - 리프레시 토큰과 푸시 토큰은 같은 트랜잭션에서 삭제한다. 이미 삭제됐거나 만료된 리프레시 토큰으로 재시도해도 `204`를 반환한다.
> - Access Token 없이 호출한다. 앱은 로그아웃 요청을 보안 저장소에 기록한 뒤 전송하고, 실패하면 다음 앱 실행 때 같은 값으로 재시도할 수 있다.
> - 세션이 만료됐다는 이유만으로 푸시 토큰을 자동 삭제하지 않는다. 앱을 오래 실행하지 않아도 예약된 리마인드를 받을 수 있도록 세션 유효기간과 푸시 등록 수명을 분리한다.

실패 응답은 본문 검증 실패 `400 / 910001`, 리프레시 토큰 검증 실패 `401 / 950001`, DB 처리 실패 `500 / 910002`다. DB 처리 실패 시 두 삭제를 모두 롤백한다.

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
