# PR #81: [feature] 링크 리마인드 시간 저장 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/81
- Author: @ninaxlee
- Base: main
- Head: feature/link-reminder-at
- Merged: 2026-08-23T15:16:25Z

## PR Body

## 📌 개요

링크 저장 시 선택적으로 리마인드 시각을 받아 저장합니다.
생성 후에도 리마인드를 변경·해제할 수 있고, 저장·상세·수정 응답에서 설정 시각을 확인할 수 있습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `links.reminder_at` nullable `timestamptz` 컬럼과 migration 추가
- [x] 링크 생성·수정 요청의 `reminderAt` validation 추가
- [x] 저장·상세·수정 응답과 Swagger 계약 갱신
- [x] DB 테이블 문서와 ERD 갱신

## 💬 리뷰어에게

- `reminderAt`은 타임존을 포함한 ISO 8601 미래 시각만 허용합니다.
- 수정 시 필드 생략은 기존 값 유지, `null`은 리마인드 해제로 처리합니다.
- 실제 이메일 발송과 스케줄러는 이번 PR 범위에 포함하지 않습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- `POST /links`: `reminderAt` 생략·`null`은 미설정, 유효한 미래 시각은 `Date`로 변환해 저장합니다.
- `PATCH /links/:linkId`: 생략하면 유지하고 `null`이면 해제하며, 미래 시각이면 변경합니다.
- `GET /links/:linkId`: 저장된 `reminderAt`을 상세 응답에 포함합니다.
- 기존 row는 nullable migration에 따라 `reminder_at=NULL`로 유지됩니다.
- `bun run test -- --runInBand`, `bun run build`, `bun run lint`, `git diff --check`를 통과했습니다.
