# API 명세서 — 링크 (Link)

> [API 명세 인덱스](./api-spec.md) · [공통 응답과 페이지네이션](./common.md) · [화면별 API 조합](./screen-mapping.md)

## 링크 목록 조회

```http
GET /links
```

화면별 별도 목록 엔드포인트를 만들지 않는다. 최근 저장, 전체, 미분류, 즐겨찾기, 최근 삭제, 사용자 폴더, 최근 본 링크, 검색 결과를 모두 `GET /links`의 독립적인 Query 조합으로 조회한다.

| Query        | 타입    | 기본값    | 설명                                 |
| ------------ | ------- | --------- | ------------------------------------ |
| `folderId`   | number  | -         | 특정 사용자 폴더의 링크만 조회       |
| `unassigned` | boolean | `false`   | `true`이면 미분류 링크만 조회        |
| `favorite`   | boolean | `false`   | `true`이면 즐겨찾기 링크만 조회      |
| `deleted`    | boolean | `false`   | `true`이면 soft delete된 링크만 조회 |
| `q`          | string  | -         | 적용된 필터 범위 안에서 검색         |
| `sortBy`     | enum    | `savedAt` | `savedAt`, `viewedAt`, `deletedAt`   |
| `order`      | enum    | `desc`    | `asc`, `desc`                        |
| `cursor`     | string  | -         | 직전 응답의 `nextCursor`             |
| `limit`      | number  | `9`       | 최대 `30`                            |

서로 다른 축의 조건은 함께 사용할 수 있다.

```http
GET /links?folderId=3&favorite=true&q=피그마&limit=9
```

다음처럼 동시에 성립할 수 없는 조건은 `400 Bad Request`로 처리한다.

- `folderId`와 `unassigned=true`
- `deleted=false`와 `sortBy=deletedAt`

`sortBy=viewedAt`을 사용하면 조회 이력이 없는 `viewedAt=null` 링크는 결과에서 제외한다.

### 화면별 링크 목록 요청 예시

아래 표는 기본 폴더를 정의하는 표가 아니라 같은 `GET /links`를 화면의 조회 목적에 맞게 사용하는 예시다. 전체·미분류·즐겨찾기·최근 삭제는 `folders` row가 아닌 링크 조회 조건이고, 특정 사용자 폴더는 `folderId`, 검색은 `q`를 사용한다. 특히 최근 삭제는 삭제된 폴더가 아니라 soft delete된 링크를 뜻한다.

| 화면         | 요청                                                  |
| ------------ | ----------------------------------------------------- |
| 전체         | `GET /links`                                          |
| 미분류       | `GET /links?unassigned=true`                          |
| 즐겨찾기     | `GET /links?favorite=true`                            |
| 최근 삭제    | `GET /links?deleted=true&sortBy=deletedAt&order=desc` |
| 특정 폴더    | `GET /links?folderId=3`                               |
| 검색 결과    | `GET /links?q=피그마`                                 |
| 최근 저장    | `GET /links?sortBy=savedAt&order=desc&limit=9`        |
| 최근 본 링크 | `GET /links?sortBy=viewedAt&order=desc&limit=9`       |

**Response `200`**

```json
{
    "success": true,
    "data": {
        "links": [
            {
                "linkId": 42,
                "title": "신입 디자이너가 알아야 할 실험 설계 팁",
                "source": "toss.tech",
                "representativeTag": null,
                "thumbnailUrl": "https://static.example.com/thumbnail.png",
                "savedAt": "2026-07-13T00:00:00.000Z"
            }
        ],
        "pagination": {
            "nextCursor": null,
            "hasNext": false,
            "limit": 9
        },
        "totalCount": 1
    }
}
```

`representativeTag`는 목록 카드에 표시할 대표 태그다. 현재는 대표 태그 선정 정책과 조회 로직이 구현되지 않아 항상 `null`을 반환하며, 추후 `LinkTagResponseDto` 형식의 태그 객체를 반환한다.

> 기존 `GET /links/search`, `GET /folders/{folderId}/links`는 이 API로 통합하여 제거한다.

## 링크 미리보기

```http
GET /links/preview?url=https%3A%2F%2Ftoss.tech%2Farticle%2F50893
```

저장 전에 원문의 OG 메타데이터를 조회한다. 아무것도 저장하지 않는다.

| Query | 타입        | 필수 | 설명                |
| ----- | ----------- | ---- | ------------------- |
| `url` | string(URL) | O    | 미리보기할 원문 URL |

**Response `200`**

```json
{
    "success": true,
    "data": {
        "title": "누군가는 토스를 테스트하는 동안, 우리는 테스트하는 법을 만듭니다.",
        "source": "toss.tech",
        "thumbnailUrl": "https://static.toss.im/assets/tech-blog/og-image/techblog-og.png"
    }
}
```

- `title`: `og:title` → `<title>` 순으로 찾고, 없으면 `null`
- `thumbnailUrl`: `og:image` → `twitter:image` 순으로 찾아 절대 URL로 반환하며, 없으면 `null`
- `source`: 리다이렉트를 모두 따라간 최종 URL의 호스트에서 선행 `www.`를 제거한 값
- 내부망·비 http(s)·잘못된 형식의 URL은 `400`(`910001`)으로 응답한다.
- 원문 요청 실패는 원인별로 구분해 응답한다.
    - `930004` (`502`): 네트워크·연결 오류로 요청 자체가 실패
    - `930005` (`504`): 제한 시간 안에 응답을 받지 못함
    - `930006` (`502`): 원문 서버가 2xx가 아닌 상태로 응답 (message에 실제 상태 코드 포함, 예: `... 404 상태로 응답했습니다.`)
    - `930007` (`502`): 리다이렉트가 너무 많거나 Location 헤더가 없어 최종 페이지에 도달 실패

## 링크 저장

```http
POST /links
```

URL을 먼저 저장하고 메타데이터, AI 요약, AI 태그, 연관 링크는 비동기로 처리한다.

**Request Body**

```json
{
    "url": "https://toss.tech/article/example",
    "folderId": null,
    "memo": null
}
```

**Response `201`**

```json
{
    "success": true,
    "data": {
        "linkId": 42,
        "url": "https://toss.tech/article/example",
        "savedAt": "2026-07-13T00:00:00.000Z"
    }
}
```

## 링크 상세 조회

```http
GET /links/{linkId}
```

링크 상세 화면에 필요한 정보를 한 번에 반환한다.

**Response `200`**

```json
{
    "success": true,
    "data": {
        "linkId": 42,
        "url": "https://toss.tech/article/example",
        "folder": {
            "folderId": 3,
            "folderName": "디자인"
        },
        "thumbnailUrl": "https://static.example.com/thumbnail.png",
        "title": "신입 디자이너가 알아야 할 실험 설계 팁",
        "source": "toss.tech",
        "publishedAt": "2026-06-19T00:00:00.000Z",
        "savedAt": "2026-07-13T00:00:00.000Z",
        "isFavorite": true,
        "viewedAt": "2026-07-13T01:00:00.000Z",
        "processingStatus": "SUCCESS",
        "aiSummary": "실험 설계와 가설 검증의 중요성을 설명하는 글입니다.",
        "tags": [
            {
                "tagId": 7,
                "name": "디자인",
                "sourceType": "ai",
                "sortOrder": 1
            }
        ],
        "memo": "다음 회의 전에 다시 보기",
        "relatedLinks": [
            {
                "linkId": 41,
                "title": "Figma Variables 정리",
                "thumbnailUrl": null
            }
        ]
    }
}
```

### 비동기 처리 중 응답

`processingStatus`는 `PENDING`, `SUCCESS`, `NEEDS_REVIEW`, `FAILED` 중 하나다.

```json
{
    "processingStatus": "PENDING",
    "aiSummary": null,
    "tags": null,
    "relatedLinks": null
}
```

- 처리 중인 비동기 데이터는 `null`로 반환한다.
- 처리가 끝났지만 목록 결과가 없으면 `tags`, `relatedLinks`는 `[]`로 반환한다.
- `aiSummary=null`의 원인은 `processingStatus`로 구분한다.
- 폴더가 없으면 `folder=null`, 발행일을 수집하지 못하면 `publishedAt=null`이다.

## 링크 수정

```http
PATCH /links/{linkId}
```

폴더, 메모, 즐겨찾기 중 전달된 필드만 변경한다.

**Request Body**

```json
{
    "folderId": 3,
    "memo": "나중에 다시 보기",
    "isFavorite": true
}
```

`folderId=null`은 미분류로 이동한다는 의미다.

**Response `200`**

```json
{
    "success": true,
    "data": {
        "linkId": 42,
        "folderId": 3,
        "memo": "나중에 다시 보기",
        "isFavorite": true,
        "updatedAt": "2026-07-13T00:00:00.000Z"
    }
}
```

## 링크 삭제

```http
DELETE /links/{linkId}
```

**Response `204`** No Content

링크는 즉시 제거하지 않고 soft delete하여 최근 삭제 화면으로 이동한다.

## 링크 복구

```http
POST /links/{linkId}/restore
```

최근 삭제된 링크를 미분류 상태로 복구한다.

**Response `201`**

```json
{
    "success": true,
    "data": {
        "linkId": 42,
        "folderId": null,
        "restoredAt": "2026-07-13T00:00:00.000Z"
    }
}
```

## 링크 조회 기록

```http
POST /links/{linkId}/view
```

상세 화면이 실제로 노출된 시점에 프론트가 호출한다. 상세 조회 GET 요청 자체는 조회 시각을 변경하지 않는다. 서버 현재 시각을 `viewedAt`으로 기록하므로 Request Body는 없다.

**Response `204`** No Content

## 후속 정책 결정

| 항목        | 내용                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| 조회 데이터 | 현재는 마지막 조회 시각만 저장하며 조회 횟수·이력이 필요하면 별도 테이블 검토 |
| 영구 삭제   | 사용자가 즉시 영구 삭제할 수 있는 API 제공 여부                               |
