# PR #58: [feature] 링크 목록 커서 페이지네이션 및 폴더 목록 정렬/집계 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/58
- Author: @hyoinkang
- Base: main
- Head: feat/list-query-implementation
- Merged: 2026-07-30T01:54:41Z

## PR Body

## 📌 개요
링크 목록(`GET /links`)에 **커서 기반 페이지네이션·정렬·즐겨찾기 필터**를 실제 구현하고, 폴더 목록(`GET /folders`)의 **정렬(`sortBy`/`order`)·`lastSavedAt`·즐겨찾기 카운트** 집계를 채웠습니다. API 변경사항(#50 #51)에 대한 TODO를 실제 구현으로 옮겼으며, 검증용 시드 스크립트도 함께 추가했습니다.

## ✅ 작업 내용 및 변경 사항
- [x] 링크 목록 커서 페이지네이션 — 복합 커서 `(정렬값, id)` 기반, `hasNext`/`nextCursor`/`totalCount` 실제 계산
- [x] 링크 목록 정렬 — `sortBy=savedAt|viewedAt|deletedAt` × `order=asc|desc`
- [x] 링크 목록 즐겨찾기 필터 — `favorite=true`
- [x] 커서 페이지네이션 공통 유틸 분리 (`common/pagination/cursor.ts`)
- [x] 잘못된 커서 방어 — `INVALID_CURSOR`(`930008`, 400)
- [x] 폴더 목록 정렬 — `sortBy=createdAt|updatedAt|lastSavedAt` × `order` (메모리 정렬, null은 방향 무관 항상 뒤)
- [x] 폴더 목록 `lastSavedAt` 집계(`MAX(links.createdAt)`) 및 즐겨찾기 링크 카운트 연결
- [x] 검증용 시드 스크립트 추가 (`bun run db:seed:list`)
- [x] Swagger/DTO 문서 실제 동작에 맞춰 동기화

## 💬 리뷰어에게
- #57 머지 이후 지금 PR의 서비스 코드도 리팩토링 한번 하겠습니다
- **null 정렬 정책이 두 도메인에서 의도적으로 다릅니다**: 링크 커서 정렬은 Postgres 기본(`DESC→NULLS FIRST`, `ASC→NULLS LAST`)을 따르고, 폴더 `lastSavedAt`은 UX상 방향과 무관하게 항상 null을 뒤로 보냅니다.
- 폴더 정렬은 사용자당 폴더 수가 적고 `lastSavedAt`이 집계값이라 컬럼 `orderBy` 대신 **메모리 정렬**로 3기준을 일관 처리했습니다.

요약 by @vcz-Chan 
- 필터를 먼저 적용
- sortBy 컬럼으로 1차 정렬
- id로 동률 순서 보장
- (정렬값, id)를 커서로 사용
- limit + 1개로 hasNext 계산

## 🔗 관련 이슈


## 🔍 상세 내용

### 링크 목록 (`GET /links`)
- **커서**: 마지막 행의 `(정렬 컬럼값, id)`를 base64url로 인코딩. `limit + 1`을 조회해 `hasNext` 판정 후 `nextCursor` 발급. `totalCount`는 커서 조건을 제외한 필터 기준으로 별도 집계.
- **정렬 안정성**: 정렬 컬럼 + `id` 복합 키로 중복·누락 없이 페이징. `viewedAt`(nullable)은 null 위치까지 커서 조건에 반영.
- **필터**: `q`(검색), `folderId`, `unassigned`, `favorite`, `deleted` + `sortBy=deletedAt`은 `deleted=true`일 때만 허용(검증).

### 폴더 목록 (`GET /folders`)
- `systemFolders.favorite.linkCount`를 활성 `isFavorite=true` 실제 카운트로 채움(기존 0 고정 제거).
- 폴더별 `lastSavedAt = MAX(활성 링크 createdAt)`, 활성 링크 없으면 `null`.
- `sortBy`/`order`를 메모리 정렬로 적용, 동률은 `folderId`로 안정 정렬.

### 검증용 시드 (`bun run db:seed:list`)
고정 사용자(`dev-seed@promise.local`) 기준으로 재실행 시 idempotent. 데이터 분포:

| 구분 | 수 | 세부 |
|---|---|---|
| 폴더 | 4 | 개발 블로그 / 디자인 레퍼런스 / 읽을거리 / **빈 폴더(링크 0)** — `createdAt`·`updatedAt`·`lastSavedAt`이 서로 다른 순서가 되도록 시각 배치 |
| 활성 링크 | 24 | 미분류 9, 폴더별 5·5·5 (기본 limit 9 → 3페이지) |
| 즐겨찾기(활성) | 6 | `favorite` 필터·카운트 검증 |
| 미조회(`viewedAt=null`, 활성) | 8 | 제목번호 `01,04,07,10,13,16,19,22` — null 정렬 검증 |
| 삭제 링크 | 4 | `deleted=true` 목록·`deletedAt` 정렬 검증 |

### 검증한 테스트 케이스
- **페이지네이션**: `GET /links` → 9개·`hasNext=true`·`totalCount=24`; 커서로 3페이지(9+9+6)까지 **무중복·무누락**; `limit=30` → 24개 한 번에 `hasNext=false`.
- **필터**: `favorite=true`→6, `folderId`→5, `unassigned=true`→9, `deleted=true`→4 (각 `totalCount` 일치).
- **정렬**: `sortBy=viewedAt&order=desc` → 미조회 8개가 **맨 앞**; `order=asc` → **맨 뒤**. `sortBy=savedAt` asc/desc 역순 확인.
- **검증 실패(400)**: `sortBy=deletedAt`(deleted 없이), `folderId`+`unassigned` 동시, `cursor=garbage`(`930008`).
- **폴더**: `systemFolders.favorite=6`(0 아님); `sortBy=createdAt/updatedAt/lastSavedAt`이 각각 다른 순서; **빈 폴더는 방향 무관 항상 맨 뒤**(`lastSavedAt=null`); `linkCount` 5/5/5/0.
