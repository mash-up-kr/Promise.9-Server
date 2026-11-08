# API 명세서 — 푸시 토큰

> Base URL: `/api/v1` · [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

푸시 토큰은 앱이 Expo의 `getExpoPushTokenAsync`로 발급받고, 이 API는 로그인한 사용자와 토큰의 연결을 관리한다. 두 API 모두 JWT 인증이 필요하며 사용자 ID는 JWT에서만 얻는다.

`UserModule` 하위의 `src/modules/user/push-token`에서 controller·입력 검증·service·repository 뼈대를 제공한다. 저장소는 스키마 PR #150 반영 후 연결하며, 현재 유효한 요청에는 **501 / 910002**를 반환한다. DB를 변경하거나 성공을 반환하지 않는다.

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

스키마 연결 후에는 전역 유니크인 `token`을 기준으로 등록·갱신한다. 반복 등록으로 중복 row를 만들지 않고, 계정 전환 시 인증된 새 사용자와 플랫폼으로 갱신한다. 토큰을 처음 발급하는 API가 아니며 알림 수신 설정을 변경하지 않는다.

## 해제

```http
DELETE /users/me/push-tokens
Authorization: Bearer <accessToken>
Content-Type: application/json

{
    "token": "ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

토큰 원문이 접근 로그 URL에 남지 않도록 본문으로 받는다. 스키마 연결 후에는 `userId`와 `token`을 함께 조건으로 삭제한다. 이미 없는 토큰이나 다른 사용자의 토큰에는 변경 없이 성공한다. 사용자에게 연결된 다른 기기 토큰은 유지한다.

로그아웃할 때는 access token을 폐기하기 전에 호출해야 한다. 토큰 삭제 시 발송 이력은 유지하며 스키마 PR #150의 FK에 따라 `push_token_id`만 NULL로 바뀐다.

## 응답

- `204 No Content`: 저장소 연결 후 등록·갱신 또는 해제 성공. 본문 없음.
- `400 / 910001`: 토큰 형식·플랫폼·본문 필드 검증 실패.
- `401 / 950001`: 인증 누락 또는 잘못된 JWT.
- `501 / 910002`: 현재 저장소 미연결 상태.

스키마 구현 시 활성 사용자 확인, token 기준 upsert, 사용자·토큰 범위를 지키는 멱등 삭제 쿼리를 연결해야 한다. DB 연결 전 메모리 저장소나 무조건 성공하는 대체 구현은 사용하지 않는다.
