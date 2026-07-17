# PR #50: [feature] 링크 화면 API 계약 통합

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/50
- Author: @vcz-Chan
- Base: main
- Head: feature/link-api-contract
- Merged: 2026-07-17T02:33:23Z

## PR Body

## 📌 개요

최근 저장, 폴더별 링크, 검색, 즐겨찾기, 최근 삭제 화면을 `GET /links` Query 조합으로 조회하도록 링크 API 계약을 통합했습니다.
즐겨찾기 저장·해제와 조회 기록은 실제 동작을 연결하고, 정렬·cursor 페이지네이션·대표 태그와 사용자 태그 API는 TODO 상태를 명확히 문서화했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `isFavorite`, `viewedAt` schema 및 Drizzle migration 추가
- [x] 즐겨찾기 수정과 `POST /links/:linkId/view` 구현
- [x] `GET /links` 필터·정렬·cursor·limit 계약 통합
- [x] 기본 `limit=9`, 최대 `30`, pagination 응답 DTO 추가
- [x] 링크 상세 비동기 데이터의 `null` 응답 계약 구체화
- [x] 목록 대표 태그 `representativeTag: null` 계약 추가
- [x] 사용자 태그 추가·삭제 Endpoint 껍데기 및 Swagger 계약 추가
- [x] 링크 DB 문서와 Drizzle snapshot 갱신

## 💬 리뷰어에게

이 PR은 `fix/common-error-contract`을 base로 하는 스택 PR입니다. 부모 PR 병합 후 base를 `main`으로 변경해서 병합해야 합니다.

DB column 추가가 있으므로 운영 환경에는 이 PR 병합·배포 전에 migration 적용이 필요합니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- 기존 검색 API를 별도로 유지하지 않고 `GET /links`에서 `q`, `folderId`, `unassigned`, `favorite`, `deleted`를 조합하는 계약으로 통합했습니다. `folderId`와 `unassigned=true`처럼 충돌하는 조합은 `400 Bad Request`입니다.
- 목록 응답은 `links`, `pagination`, `totalCount`로 구성하며 기본 `limit=9`, 최대 `30`입니다. 현재 `q`, `folderId`, `unassigned`, `deleted`, `limit`은 동작하고 `favorite`, 정렬, cursor 계산은 TODO입니다.
- `PATCH /links/:linkId`의 `isFavorite`으로 즐겨찾기를 설정·해제하고, 상세 화면 노출 시 프론트가 `POST /links/:linkId/view`를 호출해 서버 시각을 `viewedAt`에 저장합니다.
- 상세 조회는 화면에 필요한 데이터를 한 번에 반환합니다. 비동기 처리 중인 `aiSummary`, `tags`, `relatedLinks`는 `null`, 처리 완료 후 결과가 없으면 목록 필드는 `[]`입니다.
- 목록의 `representativeTag`는 선정 로직 구현 전까지 `null`이며, 태그 추가·삭제 Endpoint는 계약만 제공하고 현재 `501 Not Implemented`를 반환합니다.
