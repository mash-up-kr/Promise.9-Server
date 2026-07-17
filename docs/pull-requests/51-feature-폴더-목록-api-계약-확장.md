# PR #51: [feature] 폴더 목록 API 계약 확장

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/51
- Author: @vcz-Chan
- Base: main
- Head: feature/folder-list-api-contract
- Merged: 2026-07-17T02:33:34Z

## PR Body

## 📌 개요

보관함 화면의 링크 상태별 통계와 사용자 폴더 목록을 `GET /folders` 한 번으로 조회하도록 계약을 확장했습니다.
기존 `GET /folders/:folderId/links`는 `GET /links?folderId=...`로 대체하고 제거했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] 전체·미분류·즐겨찾기·최근 삭제 링크 수 응답 계약 추가
- [x] 사용자 폴더의 `linkCount`, `lastSavedAt` 계약 추가
- [x] 폴더 목록 `sortBy`, `order`, 선택적 `limit` Query 추가
- [x] 폴더 목록에서 cursor pagination과 totalCount 제거
- [x] 폴더 수정 명칭과 Swagger 요청 body 설명 정리
- [x] 기존 폴더별 링크 Endpoint 제거
- [x] 폴더처럼 표시되는 링크 조회 조건과 정책 불일치 문서화

## 💬 리뷰어에게

이 PR은 `feature/link-api-contract`을 base로 하는 스택 PR입니다. 부모 PR 병합 후 base를 `main`으로 변경해서 병합해야 합니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- `GET /folders`는 `systemFolders`와 `folders`를 함께 반환합니다. `systemFolders`는 전체·미분류·즐겨찾기·최근 삭제 링크 수이고, `folders`는 사용자가 생성한 실제 DB row입니다.
- 전체·미분류·즐겨찾기·최근 삭제는 `folderId`가 없는 조회 조건입니다. 항목 선택 시 별도 폴더 Endpoint가 아니라 각각 `GET /links`의 Query 조합을 사용합니다.
- 사용자 폴더에는 `folderId`, `folderName`, `linkCount`, `lastSavedAt`을 반환합니다. 현재 즐겨찾기 카운트는 `0`, `lastSavedAt`은 `null`이며 실제 집계는 TODO입니다.
- 폴더 목록에는 cursor pagination과 `totalCount`를 적용하지 않습니다. `limit`은 홈 화면에서 최근 폴더 3개처럼 반환 개수만 제한하며 정렬 적용은 TODO입니다.
- 특정 폴더의 링크는 제거된 `GET /folders/:folderId/links` 대신 `GET /links?folderId={folderId}`로 조회합니다.
