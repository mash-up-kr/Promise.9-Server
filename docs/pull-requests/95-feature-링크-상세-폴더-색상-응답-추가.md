# PR #95: [feature] 링크 상세 폴더 색상 응답 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/95
- Author: @vcz-Chan
- Base: main
- Head: feature/link-detail-folder-color
- Merged: 2026-08-25T13:47:51Z

## PR Body

## 📌 개요

링크 상세 화면에서 소속 폴더의 색상을 바로 표시할 수 있도록 `GET /links/{linkId}` 응답의 `folder` 객체에 `color`를 추가합니다.

기존 폴더 참조 조회에 색상 컬럼만 포함하는 하위 호환 응답 확장이며, 새로운 DB 쿼리나 schema 변경은 없습니다.

## ✅ 작업 내용 및 변경 사항

- [x] 링크 상세 폴더 조회에 `folders.color` 포함
- [x] 상세 응답의 `folder` 객체에 `color` 추가
- [x] `LinkFolderRefDto`와 Swagger 응답 예시 갱신
- [x] `docs/api/link.md`의 링크 상세 API 명세 갱신
- [x] 폴더 색상 응답 서비스 테스트 추가

## 📡 API 계약 변경

### Endpoint

```http
GET /links/{linkId}
Authorization: Bearer <access-token>
```

### 기존 응답

```json
{
  "folder": {
    "folderId": 3,
    "folderName": "디자인"
  }
}
```

### 변경 응답

```json
{
  "folder": {
    "folderId": 3,
    "folderName": "디자인",
    "color": "#d5d76a"
  }
}
```

- `color`는 폴더에 저장된 `#RRGGBB` 형식의 색상 값입니다.
- 미분류 링크는 기존과 동일하게 `folder: null`을 반환합니다.
- 기존 필드를 유지한 채 필드만 추가하는 하위 호환 변경입니다.

## 💬 리뷰어에게

- 기존 폴더 참조 SELECT에 `color` 컬럼만 추가해 조회 횟수는 늘어나지 않습니다.
- Link Service, Repository, Swagger DTO/예시, API 문서가 동일한 응답 계약을 사용하도록 맞췄습니다.
- DB schema 및 migration 변경은 없습니다.

## 🔗 관련 이슈

없음

## 🔍 검증

- `bun run lint` 통과
- `bun run test -- --runInBand`: 24 suites / 142 tests 통과
- `bun run build` 통과
- `bun run infra:typecheck` 통과
- `bun run infra:synth --quiet --no-notices` 통과
- `git diff --check` 통과
