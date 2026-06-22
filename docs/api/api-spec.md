# API 명세서

> Base URL: `/api/v1`  
> 인증: Bearer Token (JWT) — 별도 표기 없는 한 모든 엔드포인트에 `Authorization` 헤더 필요

---

## 공통 응답

### HTTP 상태 코드

| HTTP 상태 코드 | 설명 |
|---|---|
| `200 OK` | 성공 |
| `201 Created` | 리소스 생성 성공 |
| `202 Accepted` | 요청 접수 (비동기 처리) |
| `204 No Content` | 성공 (응답 본문 없음) |
| `400 Bad Request` | 요청 파라미터 오류 |
| `401 Unauthorized` | 인증 토큰 없음 / 만료 |
| `403 Forbidden` | 권한 없음 (타 사용자 리소스 접근) |
| `404 Not Found` | 리소스 없음 |
| `500 Internal Server Error` | 서버 오류 |

### 성공 응답

```json
{
  "data": {}
}
```

### 에러 응답

```json
{
  "statusCode": 400,
  "errorCode": "string",
  "message": "string",
  "timestamp": "2026-02-26T00:00:00.000Z"
}
```

---

## 1. 사용자 (User)

### 1-1. 내 정보 조회
```
GET /users/me
```
**Response `200`**
```json
{
  "userId": "string",
  "email": "string",
  "provider": "kakao" | "google",
  "createdAt": "2026-02-26T00:00:00Z"
}
```

---

## 2. 홈 (Home)

### 2-1. 홈 화면 조회
```
GET /home
```
> 최근 저장 링크 + 최근 활동한 폴더(폴더별 미리보기 링크 포함)를 한 번에 반환  
> 정렬: `recentLinks` — 저장 시각 최신순 / `recentFolders` — 마지막 활동 시각 최신순 / `previewLinks` — 저장 시각 최신순

**Response `200`**
```json
{
  "recentLinks": [
    {
      "linkId": "string",
      "title": "string",
      "thumbnailUrl": "string | null",
      "savedAt": "2026-02-26T00:00:00Z"
    }
  ],
  "recentFolders": [
    {
      "folderId": "string",
      "folderName": "string",
      "previewLinks": [
        {
          "linkId": "string",
          "title": "string",
          "thumbnailUrl": "string | null"
        }
      ]
    }
  ]
}
```

> `recentLinks`, `recentFolders`, `previewLinks` 각 개수 제한은 추후 확정 예정

---

## 3. 링크 (Link)

### 3-1. 링크 미리보기
```
GET /links/preview?url={url}
```
> 링크 저장 전 사용자에게 보여줄 OG 메타데이터를 동기적으로 조회. 링크 저장 탭에서 사용

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `url` | string | ✅ | 미리보기할 URL |

**Response `200`**
```json
{
  "title": "string",
  "source": "toss.tech",
  "thumbnailUrl": "string | null"
}
```

---

### 3-2. 링크 저장
```
POST /links
```
> 저장 즉시 `202 Accepted` 응답 후, 백그라운드(비동기)로 AI 요약 처리

**Request Body**
```json
{
  "url": "string",
  "folderId": "string | null",
  "memo": "string | null"
}
```
**Response `202`**
```json
{
  "linkId": "string",
  "url": "string",
  "status": "processing",
  "savedAt": "2026-02-26T00:00:00Z"
}
```

> AI 요약 처리 완료 후 `status`는 `done` / `failed` 로 업데이트됨 (폴링 또는 웹소켓 연동 검토)

---

### 3-3. 링크 상세 조회
```
GET /links/{linkId}
```
**Response `200`**
```json
{
  "linkId": "string",
  "url": "string",
  "folder": {
    "folderId": "string",
    "folderName": "string"
  },
  "thumbnailUrl": "string | null",
  "title": "string",
  "source": "toss.tech",
  "publishedAt": "2026-02-26T00:00:00Z",
  "savedAt": "2026-02-26T00:00:00Z",
  "status": "done | processing | failed",
  "tags": [
    {
      "tagId": "string",
      "name": "string"
    }
  ],
  "aiSummary": "string | null",
  "memo": "string | null",
  "relatedLinks": [
    {
      "linkId": "string",
      "title": "string",
      "thumbnailUrl": "string | null"
    }
  ]
}
```

> - `aiSummary`: AI 요약이 아직 없거나 실패한 경우 `null`
> - `tags`: 0개 이상, 최대 10개
> - `relatedLinks`: 태그가 비슷한 링크

---

### 3-4. 링크 수정 (폴더 변경 / 메모 수정)
```
PATCH /links/{linkId}
```
**Request Body** (변경할 필드만 포함)
```json
{
  "folderId": "string | null",
  "memo": "string | null"
}
```
**Response `200`**
```json
{
  "linkId": "string",
  "folderId": "string | null",
  "memo": "string | null",
  "updatedAt": "2026-02-26T00:00:00Z"
}
```

---

### 3-5. 링크 삭제
```
DELETE /links/{linkId}
```
**Response `204`** No Content

> 삭제된 링크는 즉시 제거되지 않고 **최근 삭제된 항목**으로 이동, 30일 후 영구 삭제

---

### 3-6. 링크 복구
```
POST /links/{linkId}/restore
```
> 최근 삭제된 항목에서 복구. 복구된 링크는 **미분류**로 복원

**Response `200`**
```json
{
  "linkId": "string",
  "folderId": null,
  "restoredAt": "2026-02-26T00:00:00Z"
}
```

---

### 3-7. 링크 검색
```
GET /links/search?q={keyword}&folderId={folderId}
```
> 검색 범위: 제목·출처 기준. **태그 기반 검색은 미제공** (추후 검토)

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `q` | string | ✅ | 검색 키워드 (제목·출처 기준) |
| `folderId` | string | ❌ | 특정 폴더 내 검색 (미입력 시 전체) |

**Response `200`**
```json
{
  "results": [
    {
      "linkId": "string",
      "title": "string",
      "source": "string",
      "thumbnailUrl": "string | null",
      "savedAt": "2026-02-26T00:00:00Z"
    }
  ],
  "totalCount": 0
}
```

---

## 4. 태그 (Tag)

> 태그는 링크별 독립 관리. 태그 삭제 시 해당 링크에서만 제거되며 다른 링크의 동일 태그에는 영향 없음

### 4-1. 링크에 태그 추가
```
POST /links/{linkId}/tags
```
**Request Body**
```json
{
  "name": "string"
}
```
**Response `201`**
```json
{
  "tagId": "string",
  "name": "string"
}
```

---

### 4-2. 링크에서 태그 삭제
```
DELETE /links/{linkId}/tags/{tagId}
```
**Response `204`** No Content

---

## 5. 폴더 (Folder)

### 5-1. 폴더 목록 조회
```
GET /folders
```
**Response `200`**
```json
{
  "systemFolders": {
    "all": { "linkCount": 42 },
    "uncategorized": { "linkCount": 5 },
    "recentlyDeleted": { "linkCount": 3 }
  },
  "folders": [
    {
      "folderId": "string",
      "folderName": "string",
      "linkCount": 12
    }
  ]
}
```

> - `systemFolders`는 전체·미분류·최근 삭제된 항목으로 고정, 일반 폴더와 별도 제공
> - `all`은 모든 링크 수, `recentlyDeleted`는 30일 유예 중인 링크 수

---

### 5-2. 폴더 생성
```
POST /folders
```
**Request Body**
```json
{
  "folderName": "string"
}
```
**Response `201`**
```json
{
  "folderId": "string",
  "folderName": "string",
  "createdAt": "2026-02-26T00:00:00Z"
}
```

---

### 5-3. 폴더 수정 (이름 변경)
```
PATCH /folders/{folderId}
```
**Request Body**
```json
{
  "folderName": "string"
}
```
**Response `200`**
```json
{
  "folderId": "string",
  "folderName": "string",
  "updatedAt": "2026-02-26T00:00:00Z"
}
```

---

### 5-4. 폴더 삭제
```
DELETE /folders/{folderId}
```
**Response `204`** No Content

> 폴더 삭제 시 포함된 링크는 **최근 삭제된 항목**으로 이동

---

### 5-5. 폴더 내 링크 목록 조회
```
GET /folders/{folderId}/links
```
**Response `200`**
```json
{
  "folder": {
    "folderId": "string",
    "folderName": "string"
  },
  "links": [
    {
      "linkId": "string",
      "title": "string",
      "thumbnailUrl": "string | null",
      "savedAt": "2026-02-26T00:00:00Z"
    }
  ],
  "totalCount": 12
}
```

---

## 미확정 / 추후 논의 필요 항목

| 항목 | 내용 |
|---|---|
| 인증 방식 | 구글 로그인 / 카카오 로그인 — 플로우 설계 중 |
| 홈 화면 각 섹션 노출 개수 | 최근 저장, 폴더 미리보기 등 |
| 태그 기반 검색 | 현재 미제공, 추후 검토 |
| 정렬 기준 | 폴더 목록 / 링크 목록 정렬 옵션 (홈 화면은 최신순) |
| 페이지네이션 | cursor 방식 vs offset 방식 |
| 영구 삭제 API | 최근 삭제된 항목에서 즉시 영구 삭제하는 API 필요 여부 |
