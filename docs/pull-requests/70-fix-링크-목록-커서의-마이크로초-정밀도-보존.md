# PR #70: [fix] 링크 목록 커서의 마이크로초 정밀도 보존

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/70
- Author: @vcz-Chan
- Base: main
- Head: fix/link-list-cursor-precision
- Merged: 2026-08-21T09:39:47Z

## PR Body

## 📌 개요

PostgreSQL의 마이크로초 타임스탬프가 JavaScript `Date`를 거치며 밀리초로 잘려, 같은 1ms 안에 저장된 링크가 다음 페이지에서 누락될 수 있는 문제를 수정합니다.
목록 정렬에 사용한 DB 값을 그대로 cursor에 담아 정렬 조건과 페이지 경계를 일치시킵니다.

## ✅ 작업 내용 및 변경 사항

- [x] 목록 조회 시 정렬 컬럼의 UTC 마이크로초 값을 `cursorValue`로 함께 조회
- [x] 서비스에서 JavaScript `Date` 재직렬화 없이 DB의 `cursorValue` 사용
- [x] 기존 밀리초 cursor와 신규 마이크로초 cursor를 모두 허용
- [x] DB가 반환한 마이크로초 `cursorValue`를 `nextCursor`에 그대로 보존하는 서비스 단위 테스트 추가
- [x] 형식만 맞고 실제로 존재하지 않는 날짜 cursor를 `400`으로 거부

## 💬 리뷰어에게

이전 PR 리뷰에서 제기된 edge case를 당시에는 발생 가능성이 낮다고 판단했지만, 실제 작업 중 재현되어 수정했습니다.

DB 정렬에 사용한 타임스탬프와 다음 요청의 cursor 비교 값이 동일한 정밀도를 유지하는지 확인해 주세요.
배포 전에 발급된 소수점 3자리 cursor도 계속 사용할 수 있도록 3~6자리 형식을 허용했습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### 문제 원인

PostgreSQL `timestamptz`는 마이크로초를 보존하지만 JavaScript `Date`는 밀리초까지만 표현합니다. 예를 들어 DB의 `...443365Z`와 `...443300Z`가 모두 `...443Z`로 직렬화되면, 다음 페이지의 cursor 조건이 실제 정렬 경계와 달라져 행이 누락될 수 있습니다.

### 변경 흐름

1. 목록 쿼리가 정렬 컬럼을 `YYYY-MM-DDTHH:mm:ss.USZ` 형식의 `cursorValue`로 함께 조회합니다.
2. 응답의 `nextCursor`에는 이 문자열과 link id를 저장합니다.
3. 다음 요청은 문자열을 DB에서 `timestamptz`로 변환해 기존 정렬 조건에 사용합니다.
4. 정렬 시각이 같은 경우에는 기존과 동일하게 id를 보조 정렬 키로 사용합니다.

### API 영향

- `GET /api/v1/links`의 응답 구조는 바뀌지 않습니다.
- cursor는 기존과 동일하게 클라이언트가 해석하지 않는 opaque 문자열입니다.
- 기존 소수점 3자리 cursor와 신규 6자리 cursor를 모두 허용합니다.
- PostgreSQL cast 전에 실제 달력·시각 유효성을 검사해 잘못된 cursor가 DB 오류로 이어지지 않게 합니다.

### 검증

- targeted Jest: 2 suites / 2 tests
- `bun run build`
- 실제 PostgreSQL 왕복 통합 테스트는 포함하지 않았으며, DB 정밀도 보존은 쿼리와 서비스 단위 테스트로 검증했습니다.
