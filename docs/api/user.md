# API 명세서 — 사용자 (User)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

## 내 정보 조회

```http
GET /users/me
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "userId": 1,
        "email": "user@example.com",
        "provider": "google",
        "createdAt": "2026-07-13T00:00:00.000Z"
    }
}
```
