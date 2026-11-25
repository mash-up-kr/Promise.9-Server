# API 명세서 — 알림 수신 설정

> Base URL: `/api/v1` · [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

리마인드 알림을 이메일·앱 푸시 채널별로 켜고 끈다. 수신 설정은 계정 단위라 앱·웹·익스텐션이 같은 값을 쓴다. JWT 인증이 필요하며 사용자 ID는 JWT에서만 얻는다.

`UserModule` 하위의 `src/modules/user/notification-setting`에서 구현한다. #150으로 반영된 `notification_settings` 테이블을 사용하며 마이그레이션은 추가하지 않았다.

## 조회

```http
GET /users/me/notification-settings
Authorization: Bearer <accessToken>
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "email": true,
        "push": true
    }
}
```

설정한 적 없는 채널은 `true`로 반환한다. 기존 사용자도 같다. 조회만으로는 행을 만들지 않는다.

## 변경

```http
PATCH /users/me/notification-settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
    "email": false
}
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `email` | boolean | N | 리마인드 이메일 수신 여부 |
| `push` | boolean | N | 리마인드 앱 푸시 수신 여부 |

보낸 채널만 바꾸고 보내지 않은 채널은 유지한다. 둘 중 하나 이상을 보내야 하며 정의되지 않은 필드, `null`, 문자열 `"false"` 같은 boolean이 아닌 값은 400을 반환한다.

**Response `200`** — 변경 후 전체 설정을 조회와 같은 모양으로 반환한다.

```json
{
    "success": true,
    "data": {
        "email": false,
        "push": true
    }
}
```

채널별로 `(user_id, channel)` 행 하나를 upsert한다. 사용자 행을 잠근 트랜잭션 안에서 활성 회원 여부 확인, 저장, 재조회를 처리해 탈퇴와 겹친 변경을 막고 같은 계정의 동시 변경이 서로의 응답을 섞지 않게 한다.

## 오류

- `400 / 910001`: 본문 검증 실패. 빈 본문, boolean이 아닌 값, 정의되지 않은 필드.
- `401 / 950001`: 인증 누락 또는 잘못된 JWT.
- `404 / 960001`: 존재하지 않거나 탈퇴한 사용자.

## 리마인드 발송과의 관계

- 리마인드는 발송 시점의 수신 설정을 따른다. 설정을 바꿔도 이미 잡힌 리마인드 일정(`links.reminder_at`)은 바뀌지 않는다.
- 푸시 발송(#153)이 생기기 전까지는 이메일만 보낼 채널로 본다. 이메일 수신을 끈 사용자의 리마인드는 보내지 않고, 보낸 경우와 같이 일정을 마친다(`reminder_at = null`). 나중에 다시 켜도 지난 리마인드를 몰아서 보내지 않는다.
- 푸시 수신이 켜져 있어도 기기 알림을 허용하지 않은 기기는 [푸시 토큰](./push-token.md)이 없어 발송되지 않는다.
