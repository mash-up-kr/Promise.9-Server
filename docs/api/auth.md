# API 명세서 — 인증 (Auth)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md) · [사용자 API](./user.md)
>
> Base URL: `/api/v1`
>
> 인증이 필요 없는 엔드포인트 (소셜 로그인, 토큰 재발급)는 `Authorization` 헤더 불필요

## Provider 구현 상태

| Provider | 상태 | 설명                                                                                |
| -------- | :--: | ----------------------------------------------------------------------------------- |
| Google   |  O   | ID token 검증과 로그인·가입 동작                                                    |
| Kakao    |  O   | ID token(JWKS) 검증. 웹은 idToken을 직접 못 받아 `POST /auth/kakao/exchange` 경유   |
| Apple    |  O   | ID token(JWKS) 검증. iOS 네이티브(Bundle ID)·웹(Services ID) audience 동시 지원     |

---

## 인증 플로우

```
1. 프론트에서 idToken 발급
   - Google: SDK가 idToken을 바로 반환 (앱: expo-auth-session, 웹: Google SDK)
   - Kakao
     - 앱 (iOS / Android): SDK(@react-native-seoul/kakao-login 등)가 idToken을 바로 반환
     - 웹: Kakao OIDC는 response_type=code로 고정돼 있어, idToken을 직접 못 받음.
       authorize 리다이렉트로 code를 받은 뒤 POST /auth/kakao/exchange로
       idToken을 대신 발급받아야 함 (아래 "Kakao 웹 로그인용 code→idToken 교환" 참조)
   - Apple: SDK(ASAuthorizationAppleIDProvider 등)나 웹 authorize 요청이 idToken을 바로 반환

2. idToken을 서버로 전달
   - POST /auth/social { provider, idToken }

3. 서버에서 idToken 검증
   - Google: OAuth2Client로 서명·audience(GOOGLE_CLIENT_ID) 검증
   - Kakao / Apple: JWKS로 서명·issuer·audience(KAKAO_CLIENT_ID / APPLE_CLIENT_ID) 검증
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

> - `provider`: 소셜 로그인 제공자. `google` | `kakao` | `apple`
> - `idToken`: 클라이언트 SDK(또는 아래 Kakao 웹 프록시)에서 발급받은 ID 토큰
> - `isNewUser`: 신규 가입 여부 (온보딩 처리용)
> - 지원하지 않는 provider로 요청하면 `400 Bad Request`, `errorCode=950004`

---

### Kakao 웹 로그인용 code→idToken 교환

```
POST /auth/kakao/exchange
```

웹에서만 사용한다. Kakao OIDC는 `response_type=code`로 고정돼 있어, 웹은
`client_secret` 노출 없이 idToken을 직접 받을 방법이 없다. 프론트가
authorization code를 이 엔드포인트로 넘기면, 서버가 보관한
`KAKAO_CLIENT_SECRET`으로 Kakao token endpoint와 대신 교환해 idToken을
돌려준다. 반환된 idToken은 위 `POST /auth/social` (`provider=kakao`)에
그대로 넘겨 로그인을 완료한다.

iOS/Android 네이티브 앱은 SDK가 idToken을 직접 발급하므로 이 엔드포인트가
필요 없다.

**Request Body**

```json
{
    "code": "string",
    "redirectUri": "string"
}
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "idToken": "string"
    }
}
```

> - `code`: Kakao authorization code (`response_type=code`로 발급받은 값). 1회용이며 발급 후 짧은 시간 내 만료됨
> - `redirectUri`: code 발급 요청 때 사용한 `redirect_uri`와 정확히 동일해야 함
> - code 만료·재사용, redirectUri 불일치 등으로 교환에 실패하면 `400 Bad Request`, `errorCode=950005`

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
