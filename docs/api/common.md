# API 명세서 — 공통 (Common)

> [API 명세 인덱스](./api-spec.md)

## 성공 응답

`204 No Content`를 제외한 성공 응답은 다음 형식으로 감싼다.

```json
{
    "success": true,
    "data": {}
}
```

## 에러 응답

```json
{
    "success": false,
    "error": {
        "code": 400,
        "errorCode": 910001,
        "message": "query.limit: 30 이하여야 합니다.",
        "timestamp": "2026-07-13T00:00:00.000Z"
    }
}
```

`errorCode`는 숫자이며 도메인별 코드와 메시지는 [에러 코드 정책](../policy/error-code.md)을 따른다.

- 명시적인 `errorCode`가 없는 `400 Bad Request`는 공통 validation 오류인 `910001`로 변환한다.
- 그 외 명시적인 `errorCode`가 없는 Nest 기본 `HttpException`은 공통 서버 오류인 `910002`로 변환한다.

| 상태 코드                   | 설명                               |
| --------------------------- | ---------------------------------- |
| `200 OK`                    | 조회·수정 성공                     |
| `201 Created`               | 리소스 생성·복구 성공              |
| `204 No Content`            | 요청 성공, 응답 본문 없음          |
| `400 Bad Request`           | 파라미터 형식 오류 또는 필터 충돌  |
| `401 Unauthorized`          | 인증 토큰 없음·만료·유효하지 않음  |
| `404 Not Found`             | 리소스가 없거나 사용자 소유가 아님 |
| `409 Conflict`              | 중복 생성 또는 리소스 상태 충돌    |
| `500 Internal Server Error` | 서버 오류                          |
| `501 Not Implemented`       | Endpoint 계약만 있고 로직은 TODO   |

## 링크 목록 Cursor 페이지네이션

`GET /links` 목록은 cursor 방식을 사용한다. `GET /folders`는 페이지네이션하지 않고 전체 사용자 폴더를 반환하며, 필요한 경우 `limit`으로 결과 개수만 제한한다.

| Query    | 타입   | 기본값 | 제약                 | 설명                     |
| -------- | ------ | ------ | -------------------- | ------------------------ |
| `cursor` | string | -      | 첫 페이지에서는 생략 | 직전 응답의 `nextCursor` |
| `limit`  | number | `9`    | `1` 이상 `30` 이하   | 한 번에 조회할 항목 수   |

```json
{
    "pagination": {
        "nextCursor": "opaque-string-or-null",
        "hasNext": true,
        "limit": 9
    },
    "totalCount": 42
}
```

- cursor는 서버가 생성한 opaque string이며 프론트에서 해석하거나 수정하지 않는다.
- 필터, 검색어, 정렬 조건이 바뀌면 기존 cursor를 폐기하고 첫 페이지부터 다시 요청한다.
- 동일한 시각의 데이터 순서를 보장하기 위해 서버는 리소스 ID를 보조 정렬 키로 사용한다.
- `totalCount`는 현재 필터 전체에 해당하는 개수이며 현재 페이지의 항목 수가 아니다.
