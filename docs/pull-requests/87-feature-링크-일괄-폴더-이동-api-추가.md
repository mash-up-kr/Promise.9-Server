# PR #87: [feature] 링크 일괄 폴더 이동 API 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/87
- Author: @vcz-Chan
- Base: main
- Head: feature/bulk-move-links
- Merged: 2026-08-27T14:45:28Z

## PR Body

## 📌 개요

보관함에서 여러 링크를 선택해 하나의 사용자 폴더 또는 미분류로 한 번에 이동할 수 있도록 일괄 이동 API를 추가합니다.

현재 Web은 선택한 링크마다 단건 `PATCH`를 병렬 호출하므로 일부 요청만 성공할 수 있습니다. 이 PR은 서버가 목적지와 모든 링크를 하나의 transaction에서 검증하고 이동하도록 해 전체 성공 또는 전체 실패를 보장합니다.

## 🔄 기존 방식과 변경 방식

| 구분 | 기존 | 변경 |
| --- | --- | --- |
| 요청 | 링크마다 단건 `PATCH` 호출 | `PATCH /links/folder` 1회 호출 |
| 검증 | 링크별로 개별 검증 | 목적지와 모든 링크를 한 번에 검증 |
| 실패 | 일부 링크만 이동될 수 있음 | 전체 성공 또는 전체 rollback |
| 응답 | 링크별 결과 | 요청·이동·미변경 개수 반환 |

## ✅ 작업 내용 및 변경 사항

- [x] 인증이 적용된 `PATCH /links/folder` 추가
- [x] `linkIds` 1~100개 및 양의 정수 validation
- [x] 중복 `linkIds` 제거
- [x] 사용자 소유 활성 링크와 목적지 폴더 검증
- [x] `folderId: null` 미분류 이동 지원
- [x] transaction 기반 all-or-nothing 처리
- [x] 이미 목적지에 있는 링크는 no-op 처리하고 `updatedAt` 유지
- [x] 겹치는 요청의 deadlock 방지를 위한 `links.id` 순서 row lock
- [x] DTO, Service, Repository 테스트 추가
- [x] Swagger, API 명세, 정책, 화면 매핑 문서 최신화

## 🔍 처리 흐름

```text
링크 다중 선택
→ 일괄 이동 API 1회 호출
→ 목적지 폴더 검증
→ 모든 링크의 활성 상태·소유권 검증
→ links.id 순서로 row lock
→ 목적지가 다른 링크만 일괄 갱신
→ 이동·미변경 개수 반환
```

## 🧭 처리 정책

| 상황 | 응답 | 데이터 변경 |
| --- | --- | --- |
| 빈 배열, 100개 초과, 양수가 아닌 ID | `400 Bad Request` | 없음 |
| 링크가 없거나 삭제됐거나 타 사용자 소유 | `404 Not Found` | 없음 |
| 목적지 폴더가 없거나 타 사용자 소유 | `404 Not Found` | 없음 |
| 이미 목적지에 있는 링크 | `200 OK`, `unchangedCount` 포함 | 해당 링크 변경 없음 |
| 모든 검증 통과 | `200 OK` | transaction으로 일괄 이동 |

전체·미분류·즐겨찾기·사용자 폴더·검색 결과 등 링크를 선택한 화면은 서버에서 구분하지 않습니다. 최근 삭제된 링크는 이동할 수 없습니다.

## 📡 API 계약

### Request

```http
PATCH /links/folder
Authorization: Bearer <access-token>
```

```json
{
  "linkIds": [42, 43, 44],
  "folderId": 7
}
```

미분류로 이동할 때는 `"folderId": null`을 전달합니다.

### Response

```json
{
  "success": true,
  "data": {
    "requestedCount": 3,
    "movedCount": 2,
    "unchangedCount": 1,
    "folderId": 7
  }
}
```

- `requestedCount`: 중복 제거 후 요청된 링크 수
- `movedCount`: 목적지가 달라 실제로 이동한 링크 수
- `unchangedCount`: 이미 목적지에 있어 변경하지 않은 링크 수

## 💬 리뷰어에게

- 목적지 폴더와 모든 링크를 같은 transaction에서 검증하는 방식이 적절한지
- `SELECT ... ORDER BY links.id FOR UPDATE` 잠금 순서가 동시 요청에 안전한지
- 하나라도 유효하지 않은 링크가 포함되면 전체 요청을 실패시키는 정책이 적절한지
- no-op 링크의 `updatedAt`을 유지하고 응답 count를 분리한 계약이 적절한지 확인 부탁드립니다.

## 🧪 검증

- ESLint 통과
- TypeScript 검사 통과
- Jest `25 suites / 151 tests` 통과
- DB schema 및 migration 변경 없음

## 🔗 관련 이슈

없음
