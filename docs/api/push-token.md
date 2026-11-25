# API 명세서 — 푸시 토큰

> Base URL: `/api/v1` · [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

푸시 토큰은 앱이 Expo의 `getExpoPushTokenAsync`로 발급받고, 이 API는 로그인한 사용자와 토큰의 연결을 등록·갱신한다. JWT 인증이 필요하며 사용자 ID는 JWT에서만 얻는다.

`UserModule` 하위의 `src/modules/user/push-token`에서 구현한다. #150으로 반영된 `push_tokens` 테이블을 사용하며, 정상 요청은 본문 없는 `204`를 반환한다.

## 등록·갱신

```http
PUT /users/me/push-tokens
Authorization: Bearer <accessToken>
Content-Type: application/json

{
    "token": "ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "platform": "ios"
}
```

`token`은 앞뒤 공백을 제거한 Expo Push Token이며 SDK의 형식 검증을 통과해야 한다. `platform`은 `ios`, `android`만 허용한다. 본문에 사용자 ID 등 정의되지 않은 필드를 추가하면 400을 반환한다.

전역 유니크인 `token`을 기준으로 등록·갱신한다. 반복 등록으로 중복 row를 만들지 않고 기존 ID와 생성 시각을 유지한다. 플랫폼과 수정 시각을 갱신하며 계정 전환 시 JWT의 새 사용자에게 연결한다. 다른 기기의 토큰이나 알림 수신 설정은 변경하지 않는다.

사용자 행을 잠근 트랜잭션 안에서 활성 회원 여부 확인과 upsert를 처리한다. 존재하지 않거나 탈퇴한 계정이면 404를 반환한다.

## 로그아웃 시 삭제

[로그아웃 API](./auth.md#로그아웃)에 `refreshToken`과 선택 필드 `pushToken`을 함께 보낸다. 서명 검증을 통과한 리프레시 토큰의 사용자 ID와 해당 푸시 토큰을 함께 조건으로 삭제한다. 계정 전환 뒤 늦게 도착한 이전 계정의 로그아웃 요청은 새 소유자의 토큰을 삭제하지 않는다.

로그아웃 API는 만료된 리프레시 토큰도 허용하며 Access Token 없이 호출할 수 있다. 이미 삭제된 토큰의 재요청도 성공한다. 현재 `push_histories`는 푸시 토큰을 직접 참조하지 않으므로 토큰을 삭제해도 발송 이력은 변경하지 않는다.

회원 탈퇴 시에는 계정의 soft delete와 같은 트랜잭션에서 해당 사용자의 토큰을 정리한다. 등록과 탈퇴가 겹치더라도 사용자 행 잠금으로 처리 순서를 맞춘다.

세션 만료나 장기 미접속만으로 푸시 토큰을 삭제하지 않는다. ticket·receipt의 `DeviceNotRegistered`에 따른 삭제는 `NotificationPushService`에서 처리한다. 발송 당시 사용자 ID와 해당 토큰만 조건으로 삭제하며 타임아웃·인증 오류 등 다른 실패는 토큰을 삭제하지 않는다. 리마인드 발송 처리기(#153)는 이 서비스를 사용하고 receipt 조회에 필요한 ticket·토큰 쌍을 영속 저장해야 한다.

## 응답

- `204 No Content`: 등록·갱신 성공. 본문 없음.
- `400 / 910001`: 토큰 형식·플랫폼·본문 필드 검증 실패.
- `401 / 950001`: 인증 누락 또는 잘못된 JWT.
- `404 / 960001`: 존재하지 않거나 탈퇴한 사용자.
- `500 / 910002`: DB 처리 실패. 토큰이 포함될 수 있는 SQL 오류 원문은 응답·로그에 노출하지 않는다.
