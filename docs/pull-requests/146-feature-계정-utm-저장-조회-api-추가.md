# PR #146: [feature] 계정 UTM 저장·조회 API 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/146
- Author: @vcz-Chan
- Base: main
- Head: feature/analytics-user-attribution
- Merged: 2026-11-02T12:03:29Z

## PR Body

## 개요

사용자의 최초·최근 마케팅 접점을 계정에 보관하고, 로그인한 클라이언트가 최근 UTM을 조회·동기화할 수 있도록 API를 추가합니다.

## 변경 내용

- `users`에 nullable JSONB `first_marketing_touch`, `last_marketing_touch` 컬럼과 migration `0014_user_marketing_attribution` 추가
- `GET /api/v1/users/me/attribution`: JWT 사용자의 `{ userId, utm }` 조회
- `PATCH /api/v1/users/me/attribution`: 접점을 동기화하고 저장된 `{ userId, utm }` 반환
- `GET /api/v1/users/me`는 기존 회원 정보 응답을 유지하며 UTM은 포함하지 않음
- 최초 접점은 보존하고, 더 최근 `captured_at`일 때 최근 접점 전체를 갱신. 행 잠금으로 동시 요청 직렬화
- `touch_id`·UTC `captured_at`·UTM 필드 검증, 최대 5분의 미래 시각 허용, 정의하지 않은 요청 필드 거부

계정 접점은 `touch_id`, `captured_at`, UTM 5개 필드를 유지합니다. 클라이언트 이벤트에는 UTM 5개만 스냅샷으로 기록하며 서버 API 자체는 Firehose 이벤트를 전송하지 않습니다.

## 검증과 운영 반영

- 최신 `main`을 반영한 커밋 `e512ea7`의 [CI 통과](https://github.com/mash-up-kr/Promise.9-Server/actions/runs/41441224427): lint, 단위·HTTP 테스트, PostgreSQL 18 동시 갱신 통합 테스트, CDK 검증, 빌드
- 인증 누락, 잘못된 요청, 탈퇴 계정, 시각 경계, 최초 접점 보존, 과거·동일 시각 재전송 및 응답 계약 검증
- 2026-11-02 운영 DB 백업과 아카이브 검증 후 migration `0014` 적용 완료
- 기존 migration 14개의 SQL 체크섬 일치 및 적용 후 총 15개 이력, 미적용 migration 없음 확인
- 두 컬럼의 JSONB·nullable·기본값 없음과 운영 DB 연결 정상 확인. 기존 데이터 백필 없음

## PR 스택

`main` ← #144 인프라·이벤트 계약 ← **#146 계정 UTM API**

선행 PR #144는 병합·배포 완료했습니다. base를 `main`으로 전환하고 최신 `main`을 merge 방식으로 반영했습니다.
