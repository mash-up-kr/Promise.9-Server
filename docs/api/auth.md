# API 명세서 — 인증 (Auth)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md) · [사용자 API](./user.md)
>
> Base URL: `/api/v1`
>
> 인증이 필요 없는 엔드포인트 (소셜 로그인, 토큰 재발급)는 `Authorization` 헤더 불필요.
> `POST /auth/extension-token`은 예외로, primary purpose의 Access Token이 필요하다.

## Provider 구현 상태

| Provider | 상태 | 설명                                                                                |
| -------- | :--: | ----------------------------------------------------------------------------------- |
| Google   |  O   | ID token 검증과 로그인·가입 동작                                                    |
| Kakao    |  O   | ID token(JWKS) 검증. 웹은 idToken을 직접 못 받아 `POST /auth/kakao/exchange` 경유. 네이티브 SDK가 발급하는 id_token은 audience가 REST API 키(`KAKAO_CLIENT_ID`)가 아니라 네이티브 앱 키(`KAKAO_NATIVE_APP_KEY`)라 두 값을 모두 허용해 검증 |
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

| 항목                   | 내용                                 |
| ---------------------- | ------------------------------------ |
| 발급 방식              | 자체 JWT                             |
| accessToken 만료 시간  | `JWT_ACCESS_EXPIRES_IN`, 기본 `15m`  |
| refreshToken 만료 시간 | `JWT_REFRESH_EXPIRES_IN`, 기본 `30d` |
| refreshToken 저장      | REFRESH_TOKENS 테이블                |
| Refresh Token Rotation | 재발급 시 기존 토큰 폐기, 신규 발급  |
| purpose                | `primary`(소셜 로그인 직접 발급) \| `extension`(`POST /auth/extension-token` 위임 발급). rotation 중에도 유지 |

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
> - 이메일이 이미 다른 provider로 가입돼 있으면 자동으로 병합하지 않고 `409 Conflict`, `errorCode=960002`를 반환한다. 같은 사람이어도 provider마다 별개 계정이며, 기존에 가입한 provider로 로그인해야 한다

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

⚠️ **선행 조건**: idToken은 순수 OAuth가 아니라 OIDC 확장 기능이라, 이 code를
발급받는 authorize 요청의 `scope`에 `openid`가 반드시 포함되어야 한다.
빠뜨리면 `response_type=code` 자체는 정상적으로 code를 내주지만, token 교환
응답에 idToken이 없어 이 엔드포인트가 항상 `KAKAO_EXCHANGE_FAILED`를
반환한다.

```
https://kauth.kakao.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=openid
```

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
> - code 만료·재사용, redirectUri 불일치, openid scope 누락 등으로 교환에 실패하면 `400 Bad Request`, `errorCode=950005`
> - Kakao 서버가 rate limit(429)이나 장애(5xx)로 응답하면, 클라이언트의 code/redirectUri 문제와 구분해 `502 Bad Gateway`, `errorCode=950006`를 반환한다. 네트워크 타임아웃(5초)도 동일하게 처리된다

---

### 익스텐션용 토큰쌍 발급

```
POST /auth/extension-token
```

브라우저 익스텐션은 별도 로그인 UI 없이, 웹 로그인 페이지로 리다이렉트시켜
로그인을 완료시킨 뒤 이 엔드포인트로 익스텐션 전용 토큰쌍을 받아간다.

```
익스텐션 → 웹 로그인 페이지 이동
→ 웹에서 로그인 완료 (웹 토큰쌍 발급, purpose=primary)
→ 웹이 POST /auth/extension-token 호출 (Authorization: 웹 access token)
→ 새 tokenFamily · purpose=extension 으로 별도 토큰쌍 발급
→ 웹이 익스텐션에 두 번째 토큰쌍 전달
```

**Headers**

```
Authorization: Bearer <primary purpose access token>
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

> - 발급된 토큰쌍은 원본 세션과 별개의 `token_family`로 발급되어 서로 독립적으로 회전/폐기된다 (한쪽을 로그아웃해도 다른 쪽엔 영향 없음)
> - `purpose=primary`인 Access Token으로만 호출할 수 있다. 이 endpoint가 발급한 `purpose=extension` 토큰으로는 다시 호출할 수 없다 (재귀 발급 차단). rotation(`POST /auth/refresh`) 중에도 purpose가 유지되므로, extension 토큰을 회전시켜도 primary 권한을 얻을 수 없다
> - `MASTER_ACCESS_TOKEN` 인증 우회는 이 엔드포인트에는 적용되지 않는다 (다른 엔드포인트와 달리 실제 서명된 JWT만 허용)
> - 인증 실패 시 `401 Unauthorized`, `errorCode=950001`
> - 발급된 토큰쌍을 익스텐션에 전달할 때 URL 쿼리스트링/리다이렉트는 사용하지 않는다 (브라우저 히스토리·리퍼러에 노출됨). `postMessage` 등 안전한 채널로 전달한다

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
