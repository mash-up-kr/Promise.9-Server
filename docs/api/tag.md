# API 명세서 — 태그 (Tag)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md) · [링크 상세](./link.md#링크-상세-조회)

태그는 링크별로 관리한다. 같은 이름의 태그가 다른 링크에 있어도 서로 다른 리소스다.

> 현재 상태: 두 API 모두 Endpoint·인증·요청 검증·Swagger 계약만 연결된 껍데기다. 저장·삭제 로직은 TODO이며 구현 전까지 유효한 요청에도 `501 Not Implemented`를 반환한다.

## 링크에 태그 추가

```http
POST /links/{linkId}/tags
```

현재 Endpoint 껍데기만 제공한다. 링크 소유권 확인, 이름 정규화, 중복 검사 및 DB 저장은 TODO다.

**Request Body**

```json
{
    "name": "실험 설계"
}
```

**Response `201`**

```json
{
    "success": true,
    "data": {
        "tagId": 7,
        "name": "실험 설계",
        "sourceType": "user",
        "sortOrder": null
    }
}
```

- `sourceType`: `user`, `rule`, `ai` 중 하나다. 사용자가 추가한 태그는 `user`로 저장한다.
- `sortOrder`: 링크 상세의 태그 표시 순서다. 순서를 지정하지 않았으면 `null`이다.
- `userId`, `linkId`, `normalizedName`은 서버 내부 소유권·중복 검사 필드로 API 응답에 노출하지 않는다.

## 링크에서 태그 삭제

```http
DELETE /links/{linkId}/tags/{tagId}
```

현재 Endpoint 껍데기만 제공한다. 링크·태그 소유권 확인 및 DB 삭제는 TODO다.

**Response `204`** No Content
