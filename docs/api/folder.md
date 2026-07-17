# API 명세서 — 폴더 (Folder)

> [API 명세 인덱스](./api-spec.md) · [공통 응답과 페이지네이션](./common.md) · [링크 목록](./link.md#링크-목록-조회)

## 용어 구분

- 사용자 폴더: 사용자가 생성한 실제 `folders` row다. `folderId`가 있으며 생성·수정·삭제할 수 있다.
- 전체·미분류·즐겨찾기·최근 삭제: 화면에서는 폴더처럼 표시되지만 실제 `folders` row가 아닌 링크 목록 조회 조건이다. `folderId`가 없으며 폴더 CRUD 대상이 아니다.
- 특히 최근 삭제는 삭제된 폴더 목록이 아니라 soft delete된 링크 목록을 뜻한다.

## 폴더 목록 및 링크 상태별 카운트 조회

```http
GET /folders
```

전체·미분류·즐겨찾기·최근 삭제 링크 수와 사용자 폴더 목록을 반환한다. 응답의 `systemFolders`는 실제 폴더 목록이 아니라 `GET /links` 조회 조건별 통계이고, `folders`만 실제 사용자 폴더 목록이다.

| Query    | 타입   | 기본값      | 설명                                                 |
| -------- | ------ | ----------- | ---------------------------------------------------- |
| `sortBy` | enum   | `updatedAt` | `createdAt`, `updatedAt`, `lastSavedAt`              |
| `order`  | enum   | `desc`      | `asc`, `desc`                                        |
| `limit`  | number | -           | 선택적 결과 개수 제한. 생략하면 전체 반환, 최대 `30` |

홈 화면의 최근 저장 폴더 3개는 다음과 같이 요청한다.

```http
GET /folders?sortBy=lastSavedAt&order=desc&limit=3
```

`lastSavedAt`은 폴더 수정 시각이 아니라 해당 폴더에 마지막으로 링크가 저장된 시각이다.

폴더 목록에는 cursor 페이지네이션을 적용하지 않는다. 따라서 응답에 `pagination`과 `totalCount`가 없으며, `limit`은 다음 페이지 조회를 위한 값이 아니라 홈 화면처럼 필요한 개수만 제한하는 용도다.

**Response `200`**

```json
{
    "success": true,
    "data": {
        "systemFolders": {
            "all": { "linkCount": 42 },
            "uncategorized": { "linkCount": 5 },
            "favorite": { "linkCount": 7 },
            "recentlyDeleted": { "linkCount": 3 }
        },
        "folders": [
            {
                "folderId": 3,
                "folderName": "디자인",
                "linkCount": 12,
                "lastSavedAt": "2026-07-13T00:00:00.000Z"
            }
        ]
    }
}
```

전체·미분류·즐겨찾기·최근 삭제 항목을 선택하면 별도의 폴더 상세 API가 아니라 다음 링크 목록 요청으로 이동한다.

| 화면의 링크 목록 항목 | 링크 목록 요청                                        |
| --------------------- | ----------------------------------------------------- |
| 전체                  | `GET /links`                                          |
| 미분류                | `GET /links?unassigned=true`                          |
| 즐겨찾기              | `GET /links?favorite=true`                            |
| 최근 삭제된 링크      | `GET /links?deleted=true&sortBy=deletedAt&order=desc` |

## 폴더 생성

```http
POST /folders
```

사용자가 소유할 실제 폴더 row를 생성한다. 전체·미분류·즐겨찾기·최근 삭제 링크 목록 항목을 생성하는 API가 아니다.

**Request Body**

```json
{
    "folderName": "개발"
}
```

**Response `201`**

```json
{
    "success": true,
    "data": {
        "folderId": 3,
        "folderName": "개발",
        "createdAt": "2026-07-13T00:00:00.000Z"
    }
}
```

## 폴더 수정

```http
PATCH /folders/{folderId}
```

사용자가 생성한 실제 폴더 row를 수정한다. 현재 지원하는 수정 필드는 `folderName`뿐이다. 전체·미분류·즐겨찾기·최근 삭제 링크 목록 항목은 `folderId`가 없으므로 이 API의 대상이 아니다.

**Request Body**

```json
{
    "folderName": "읽을거리"
}
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "folderId": 3,
        "folderName": "읽을거리",
        "updatedAt": "2026-07-13T00:00:00.000Z"
    }
}
```

## 폴더 삭제

```http
DELETE /folders/{folderId}
```

사용자가 생성한 실제 폴더 row만 삭제할 수 있다. 전체·미분류·즐겨찾기·최근 삭제 링크 목록 항목은 삭제할 폴더 row가 아니므로 이 API의 대상이 아니다.

**Response `204`** No Content

폴더에 포함된 활성 링크는 최근 삭제된 링크 목록으로 이동한다.

## 후속 정책 결정

| 항목             | 내용                                                |
| ---------------- | --------------------------------------------------- |
| 홈 폴더 미리보기 | 폴더별 `GET /links` 호출 또는 홈 전용 집계 API 여부 |
