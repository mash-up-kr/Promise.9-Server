# PR #101: [feature] 홈 리마인드 링크 조회 및 추천 노출 기준 조정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/101
- Author: @vcz-Chan
- Base: main
- Head: feature/home-sections-api
- Merged: 2026-08-29T01:18:54Z

## PR Body

## 📌 개요

홈 화면의 `다시 볼 링크` 섹션에서 정확한 리마인드 목록을 조회할 수 있도록 기존 `GET /links` 계약을 확장합니다.

함께 노출되는 `자주 저장한 키워드` 섹션은 폴더·태그 혼합 정책을 유지하면서 최소 추천 후보 수만 4개에서 3개로 조정합니다.

## ✅ 작업 내용 및 변경 사항

- [x] 링크 목록 응답에 `reminderAt` 추가
- [x] `reminder=true` 필터 추가
- [x] `sortBy=reminderAt` 및 기존 cursor 페이지네이션 연결
- [x] `reminderAt=null` 링크 제외
- [x] 지난 리마인드 시각을 포함해 `order=asc`이면 만료·임박 순 정렬
- [x] `q`와 `reminder=true` 또는 `sortBy=reminderAt` 조합 validation 거부
- [x] 검색 결과를 포함한 모든 링크 목록 응답에서 `reminderAt` 반환
- [x] 추천 후보 최소 노출 개수 4개 → 3개 조정
- [x] DTO, Service, validation 및 추천 경계값 테스트 추가
- [x] Swagger와 API·화면 매핑 문서 갱신

## 📡 API 계약

```http
GET /api/v1/links?reminder=true&sortBy=reminderAt&order=asc&limit=9
Authorization: Bearer <access-token>
```

- `reminder=true`: `reminderAt IS NOT NULL`인 활성 링크만 조회합니다.
- `sortBy=reminderAt`: 리마인드 시각을 cursor 정렬 키로 사용합니다.
- `order=asc`: 지난 시각을 포함해 가장 이른 리마인드부터 반환합니다.
- 리마인드 목록은 홈 전용 일반 목록 조회로 사용하며 검색어 `q`와 결합할 수 없습니다.
- 목록의 각 링크는 `reminderAt: string | null`을 반환합니다.

## 🧭 추천 노출 정책

- 폴더와 태그를 같은 후보 목록에 합치는 기존 정책은 유지합니다.
- 개별 후보는 활성 링크 3개 이상 조건을 그대로 사용합니다.
- 전체 후보가 3개 이상이면 목록을 반환하고, 2개 이하면 `data: null`을 반환합니다.

## 💬 리뷰어에게

- `reminder=true`가 지난 시각과 발송 실패로 유지된 리마인드도 포함하는 정책이 적절한지 확인 부탁드립니다.
- `q`와 리마인드 조회 조건을 validation 단계에서 거부하는 범위가 적절한지 확인 부탁드립니다.
- 추천의 폴더·태그 혼합 구조는 변경하지 않고 최소 후보 수만 조정했습니다.

## 🧪 검증

- `bun run lint`
- `bun run build`
- Jest: 31 suites / 172 tests 통과
- pre-commit Bun test: 182 tests 통과
- `git diff --check`

DB schema와 migration 변경은 없습니다.
