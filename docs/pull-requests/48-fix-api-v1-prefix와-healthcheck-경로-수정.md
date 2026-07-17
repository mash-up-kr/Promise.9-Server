# PR #48: [fix] API v1 prefix와 healthcheck 경로 수정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/48
- Author: @vcz-Chan
- Base: main
- Head: fix/api-v1-healthcheck
- Merged: 2026-07-17T02:07:16Z

## PR Body

## 📌 개요

API 명세의 Base URL인 `/api/v1`과 실제 서버 라우팅을 일치시켰습니다.
Global prefix 적용 후 Docker healthcheck가 기존 `/`를 호출해 컨테이너가 unhealthy가 되는 문제를 함께 수정했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] NestJS global prefix를 `api/v1`로 설정
- [x] Docker healthcheck 경로를 `/api/v1`로 변경
- [x] 기본 e2e 요청 경로와 성공 응답 형식 갱신

## 💬 리뷰어에게

다른 API 계약 변경과 의존하지 않는 독립 수정 PR입니다. 스택 PR보다 먼저 병합할 수 있습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- 애플리케이션 API를 `/api/v1` 아래로 통일해 문서의 Base URL과 실제 요청 경로를 일치시켰습니다.
- Docker는 실제로 `200 OK`를 반환하는 `/api/v1`을 확인하므로 배포 후 정상 컨테이너가 healthcheck 경로 불일치로 `unhealthy` 처리되지 않습니다.
- e2e 기준 요청도 `GET /api/v1`과 공통 성공 응답 `{ success: true, data }`를 사용하도록 맞췄습니다.
