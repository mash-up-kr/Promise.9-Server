# PR #39: [feature] link, folder DB 스키마 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/39
- Author: @Choi-JY1107
- Base: main
- Head: feature/1th-ut-setting
- Merged: 2026-07-12T09:25:19Z

## PR Body

## 📌 개요

1. 기본적인 DB 설계 및 스키마를 구현했습니다.
2. 링크, 폴더 API의 request/response 예시를 Swagger로 문서화했습니다.

## ✅ 작업 내용 및 변경 사항
- [x] DB 스키마 파일 작성
- [x] 기존 links를 비정규화 구조로 교체
- [x] 폴더명 유일성을 DB 유니크 제약 대신 코드에서 deleted_at IS NULL 기준으로 검증
- [x] 마이그레이션 재생성(drizzle/0000_init.sql + meta) 및 통합 ERD 문서(`docs/database/erd.md`) 작성
- [x] `docs/database/setup.md`에 Drizzle 명령어(generate/migrate/push/studio) 정리
- [x] 링크/폴더 API 요청·성공 응답 Swagger 예시 문서화 (응답 DTO + ApiCommonResponse 데코레이터)

## 💬 리뷰어에게

1. 테이블명이 초기와 바뀌었습니다. 예를 들어 `user_link_tags` -> `tags` 이런 식으로요. 괜찮을까요?
2. 에러 코드는 추후 미나 PR 머지 후, 추가하겠습니다.
3. user의 경우, 효인이의 PR 머지 후 수정하겠습니다.

## 🔗 관련 이슈
close #

## 🔍 상세 내용

- DB 마이그레이션은 미적용된 상태입니다. 빠른 머지 후, 적용하겠습니다.

<img width="664" height="1522" alt="image" src="https://github.com/user-attachments/assets/4b2a137a-0958-45ad-91f1-785a0f892aaa" />
