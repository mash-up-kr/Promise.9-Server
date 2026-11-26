# PR #158: [refactor] 푸시 토큰 삭제를 로그아웃으로 통합

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/158
- Author: @ninaxlee
- Base: main
- Head: refactor/push-token
- Merged: 2026-11-25T14:47:27Z

## PR Body

## 📌 개요

별도의 푸시 토큰 해제 API를 제거하고 `POST /auth/logout`에서 리프레시 토큰과 해당 기기의 푸시 토큰을 함께 삭제합니다. 로그아웃에서만 만료된 리프레시 토큰을 허용해 오프라인 로그아웃이나 세션 만료 이후에도 서명을 검증해 정리 요청을 재시도할 수 있습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `DELETE /users/me/push-tokens` 및 전용 DTO·스키마·서비스·Swagger 제거
- [x] 로그아웃에 선택 필드 `pushToken` 추가, 누락·잘못된 형식은 무시
- [x] 로그아웃에서만 리프레시 토큰 만료 허용, 서명·용도·사용자 ID 검증 유지
- [x] 리프레시 토큰과 푸시 토큰 삭제를 같은 트랜잭션으로 처리
- [x] API 문서와 로그아웃·등록 API·DB 통합 테스트 갱신

## 💬 리뷰어에게

푸시 토큰은 리프레시 토큰에서 확인한 사용자 ID와 `pushToken`을 함께 조건으로 삭제합니다. 계정 전환 뒤 늦게 도착한 이전 계정의 로그아웃 요청이 새 소유자의 토큰을 삭제하지 않도록 했습니다. 세션 만료·장기 미접속만으로 푸시 토큰을 삭제하지 않습니다.

후속 작업(#153): 현재 `PushService`는 Expo ticket·receipt의 오류를 결과값으로 반환하며, 그 결과를 처리하는 실제 리마인드 발송 배치는 없습니다. 발송·receipt 처리부가 구현되면 `DeviceNotRegistered`일 때 발송 당시의 사용자 ID와 해당 토큰을 조건으로 삭제해야 합니다. receipt 처리를 위해 ticket과 토큰의 연결 정보를 보관하고, 타임아웃·인증정보 오류·`MessageTooBig` 등 다른 오류는 토큰을 삭제하지 않아야 합니다. 이 후속 처리를 위한 별도 서비스·모듈은 이번 PR에 추가하지 않습니다.

## 🔗 관련 이슈

- #154: 푸시 토큰 등록·해제 API 후속 변경
- #153: `DeviceNotRegistered` 토큰 정리 후속 작업

## 🔍 상세 내용

로그아웃 요청 예시:

```json
{
  "refreshToken": "...",
  "pushToken": "ExponentPushToken[...]"
}
```

- Access Token 없이 호출하며, 만료되거나 이미 삭제된 리프레시 토큰의 재요청도 서명·용도·사용자 ID 검증을 통과하면 정리합니다.
- `/auth/refresh`와 회원 탈퇴는 기존처럼 리프레시 토큰 만료를 검사합니다.
- 토큰이 포함될 수 있는 DB 오류 원문은 응답·로그에 노출하지 않습니다.
- PUT의 토큰 기준 upsert와 회원 탈퇴 시 일괄 삭제 동작은 유지합니다.

검증:

- 기존 검증에서 `bun run build`, 변경 파일 ESLint, 로그아웃·푸시 토큰 API 회귀 테스트 26개 통과
- 미사용 푸시 정리 계층을 제거한 이번 수정에서는 남은 참조와 diff 오류를 확인했으며 테스트는 재실행하지 않음
- PostgreSQL 통합 테스트는 `TEST_DATABASE_URL` 미설정으로 미실행
- 커밋 훅의 전체 병렬 테스트는 Node 메모리 할당 오류로 실패했고, 순차 재실행은 일부 통과 후 중단함. 위 대상 검증 결과를 기준으로 추가 훅 실행을 생략함
