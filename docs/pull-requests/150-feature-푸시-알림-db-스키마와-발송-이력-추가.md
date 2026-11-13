# PR #150: [feature] 푸시 알림 DB 스키마와 발송 이력 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/150
- Author: @hyoinkang
- Base: main
- Head: feature/push-notification-schema
- Merged: 2026-11-13T07:42:17Z

## PR Body

## 📌 개요

푸시 알림에 필요한 토큰, 채널별 수신 설정, 이메일·푸시 발송 이력의 DB 스키마를 추가합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `push_tokens`, `notification_settings`, `email_histories`, `push_histories` 테이블 추가
- [x] 이메일·푸시가 공유할 회차 식별자 `links.reminder_occurrence_id` 추가
- [x] 중복 방지 제약, 상태 CHECK 및 조회 인덱스 추가
- [x] 복합 FK로 링크와 푸시 토큰의 소유자 일치 보장
- [x] 기존 발송 이력의 `user_id` 보강 migration 추가
- [x] Drizzle 마이그레이션과 스냅샷, 테이블별 설계 문서·통합 ERD·README 갱신
- [x] PostgreSQL 통합 테스트 추가

## 🔍 상세 내용

- 수신 설정은 사용자·채널별로, 발송 이력은 회차별로 중복을 제한합니다. 푸시는 기기별 이력을 구분합니다.
- 서로 다른 회원의 링크와 푸시 토큰을 연결하면 DB에서 거부합니다.
- 토큰 삭제 시 `push_token_id`만 `NULL`로 변경하고 소유자와 발송 이력은 유지합니다.
- 기존 발송 이력의 `user_id`는 링크 소유자로 채웁니다. 소유자가 다른 토큰이 연결되어 있으면 migration이 실패하고 롤백됩니다.
- `reminder_occurrence_id`는 nullable UUID이며 기존 링크의 값은 `NULL`로 유지합니다.
- 이번 PR은 DB 스키마 추가 범위이며, 실제 발송 로직은 별도로 연결합니다. 운영 DB 마이그레이션은 미적용 상태입니다.

## 검증

- 빌드, 변경 파일 ESLint, Drizzle 스키마·스냅샷 일치 확인
- PostgreSQL 통합 테스트 17개 통과: 소유자 불일치 거부, 기존 이력 보강·롤백, 토큰 삭제 후 이력 보존 포함
- 테이블 문서 11개와 README 링크 일치, 문서 내부 링크 및 `git diff --check` 확인
