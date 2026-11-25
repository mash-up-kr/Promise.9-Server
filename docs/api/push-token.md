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

로그아웃 API는 만료된 리프레시 토큰도 허용하며 Access Token 없이 호출할 수 있다. 이미 삭제된 토큰의 재요청도 성공한다. 토큰을 삭제해도 발송 이력은 남고, 이력의 `push_token_id`만 `NULL`이 된다.

회원 탈퇴 시에는 계정의 soft delete와 같은 트랜잭션에서 해당 사용자의 토큰을 정리한다. 등록과 탈퇴가 겹치더라도 사용자 행 잠금으로 처리 순서를 맞춘다.

세션 만료나 장기 미접속만으로 푸시 토큰을 삭제하지 않는다.

## 리마인드 알림

리마인드 시각이 되면 푸시 수신을 켠 사용자의 등록된 모든 기기로 아래 알림을 보낸다. 같은 리마인드는 기기마다 한 번만 보낸다. 발송 규칙은 [Expo Push 발송 모듈](../infrastructure/push.md#리마인드-배치-연동)을 참고한다.

```json
{
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "저장해둔 링크 지금 볼까요?",
    "body": "링크 제목",
    "data": { "type": "LINK_REMINDER", "linkId": 123 },
    "sound": "default",
    "priority": "high",
    "channelId": "reminder"
}
```

| 필드 | 값 |
| --- | --- |
| `title` | 고정 문구 `저장해둔 링크 지금 볼까요?` |
| `body` | 링크 제목. 제목이 없으면 이메일과 같은 `저장한 링크` |
| `data.type` | `LINK_REMINDER` |
| `data.linkId` | 링크 ID(number). 앱은 알림을 누르면 이 링크의 상세를 연다 |
| `sound` | 기기 기본 소리 |
| `priority` | `high`. 지연 없이 바로 표시한다 |
| `channelId` | Android 알림 채널 `reminder`. 앱이 같은 ID로 채널을 만든다 |

## 응답

- `204 No Content`: 등록·갱신 성공. 본문 없음.
- `400 / 910001`: 토큰 형식·플랫폼·본문 필드 검증 실패.
- `401 / 950001`: 인증 누락 또는 잘못된 JWT.
- `404 / 960001`: 존재하지 않거나 탈퇴한 사용자.
- `500 / 910002`: DB 처리 실패. 토큰이 포함될 수 있는 SQL 오류 원문은 응답·로그에 노출하지 않는다.
