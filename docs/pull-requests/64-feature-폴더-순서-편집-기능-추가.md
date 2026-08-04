# PR #64: [feature] 폴더 순서 편집 기능 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/64
- Author: @hyoinkang
- Base: main
- Head: feat/folder-order-edit
- Merged: 2026-08-01T10:44:37Z

## PR Body

## 📌 개요
<!-- 이 PR의 목적과 결과를 2~3문장으로 작성합니다. -->
폴더 목록에 사용자가 순서를 직접 편집하는 기능을 추가합니다. 정렬 기능이 사라짐에 따라 `sortBy`/`order`는 걷어내 저장 순서를 편집한 적이 있다면 저장한 순서대로 목록을 반환하고, 없다면 기본값으로 폴더 생성순으로 목록을 반환합니다. 홈화면의 최근 저장한 폴더에 사용할 목적으로 recent 파라미터를 추가했습니다.

## ✅ 작업 내용 및 변경 사항
<!-- 주요 작업 내용과 변경 사항을 체크리스트로 작성합니다. -->
- [ ] 폴더 순서 편집 API 추가 - `PUT /folders/order`
- [ ] recent 파라미터 추가 - `GET /folders` : lastSavedAt 기준 최신순 정렬
- [ ] sortBy / order 파라미터 제거 - `GET /folders`

## 💬 리뷰어에게
<!-- 중점적으로 봐줬으면 하는 부분이나 논의가 필요한 내용을 작성합니다. -->
폴더 목록에서 정렬 기능 사라짐 + 폴더 목록 편집 기능 추가했습니다~

## 🔗 관련 이슈
N/A

## 🔍 상세 내용
<!-- 변경 로직, 주요 흐름, 설계 의도, 다이어그램 등 공유가 필요한 내용을 작성합니다. -->
### 폴더 순서 편집 (`PUT /folders/order`)
- Body `{ folderIds: [4, 2, 3, 1] }` — 원하는 최종 순서대로 나열한 folderId 전체 배열.
- 트랜잭션 내에서 사용자 폴더를 `FOR UPDATE`로 잠그고, 넘어온 배열이 폴더 전체와 일치하는지 검증한 뒤 index 순서대로 `sortOrder = 0..n-1`을 부여.
- 성공 시 `204 No Content`. 불일치 시 `920003 REORDER_MISMATCH`(400).

### 목록 조회 (`GET /folders`)
- `sort_order ASC NULLS LAST, id ASC`로 repository에서 정렬. 순서 편집 전엔 `sort_order`가 전부 null이라 **생성순(id 오름차순)** 이 됨.
- `recent=true`면 서비스에서 `lastSavedAt` 최신순으로 재정렬 → 홈 화면 최근 저장 폴더용.
