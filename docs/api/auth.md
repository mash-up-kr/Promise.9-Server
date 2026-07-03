# API 명세서 — 인증 (Auth)

> Base URL: `/api/v1`
> 인증이 필요 없는 엔드포인트 (소셜 로그인, 토큰 재발급)는 `Authorization` 헤더 불필요

---

## 인증 플로우

```
1. 프론트에서 구글 / 카카오 SDK로 idToken 발급
   - 앱 (iOS / Android): expo-auth-session
   - 웹 (Expo Web): 각 플랫폼 SDK 사용

2. idToken을 서버로 전달
   - POST /auth/social { provider, idToken }

3. 서버에서 idToken 검증
   - provider에 따라 Google / Kakao OIDC 검증
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

### USERS
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | 유저 고유 ID |
| `email` | varchar UK | 이메일 |
| `created_at` | timestamptz | 생성 일시 |
| `updated_at` | timestamptz | 수정 일시 |
| `deleted_at` | timestamptz | 탈퇴 일시 (soft delete) |

### SOCIAL_ACCOUNTS
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | 소셜 계정 고유 ID |
| `user_id` | bigint FK | USERS.id 참조 |
| `provider` | varchar | 소셜 제공자 (`google` / `kakao`) |
| `provider_user_id` | varchar | 소셜 측 유저 고유 ID |
| `provider_email` | varchar | 소셜 측 이메일 |
| `connected_at` | timestamptz | 소셜 연결 일시 |
| `created_at` | timestamptz | 생성 일시 |
| `updated_at` | timestamptz | 수정 일시 |

> - `provider` + `provider_user_id` 복합 유니크 인덱스 필요
> - 추후 멀티 소셜 계정 연결 확장 가능한 구조

### REFRESH_TOKENS
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | 토큰 고유 ID |
| `user_id` | bigint FK | USERS.id 참조 |
| `token` | varchar | refreshToken 값 |
| `expires_at` | timestamptz | 만료 일시 |
| `created_at` | timestamptz | 생성 일시 |

> - 로그아웃 / 탈퇴 / Rotation 시 해당 토큰 삭제
> - 멀티 디바이스 로그인 지원 가능한 구조 (유저당 복수 토큰)

---

## 토큰 정책

| 항목 | 내용 |
|---|---|
| 발급 방식 | 자체 JWT |
| accessToken 만료 시간 | 상수 관리 (추후 확정) |
| refreshToken 만료 시간 | 상수 관리 (추후 확정) |
| refreshToken 저장 | REFRESH_TOKENS 테이블 |
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
  "provider": "google" | "kakao",
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
> - `idToken`: 클라이언트에서 각 SDK로 발급받은 ID 토큰 (Google / Kakao OIDC)
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

### 내 정보 조회
```
GET /users/me
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "userId": 1,
    "email": "string",
    "provider": "google" | "kakao",
    "createdAt": "2026-02-26T00:00:00Z"
  }
}
```

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