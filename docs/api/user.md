# API 명세서 — 사용자 (User)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

## 내 정보 조회

```http
GET /users/me
```

**Response `200`**

```json
{
    "success": true,
    "data": {
        "userId": 1,
        "email": "user@example.com",
        "provider": "google",
        "createdAt": "2026-07-13T00:00:00.000Z",
        "firstMarketingTouch": null,
        "lastMarketingTouch": null
    }
}
```

JWT 인증이 필요하다. `firstMarketingTouch`와 `lastMarketingTouch`는 아래 `MarketingTouch` 객체 또는 `null`이다. 기존 계정은 마케팅 접점을 동기화하기 전까지 두 필드가 `null`이다.

## 마케팅 접점 동기화

```http
PATCH /users/me/attribution
Authorization: Bearer <accessToken>
Content-Type: application/json
```

비로그인 중 보관한 UTM은 **로그인 성공 후**, 로그인 상태에서 새 UTM으로 유입되면 **수집 직후** 이 API로 계정에 연결한다. 사용자 ID는 JWT에서 얻으므로 body로 받지 않는다. 웹·앱·익스텐션 모두 같은 계약을 사용한다.

**Request — `MarketingTouch`**

```json
{
    "touch_id": "a622a8bf-bc12-4782-bd84-c89b01389d5c",
    "captured_at": "2026-10-15T09:00:00.000Z",
    "utm_source": "instagram",
    "utm_medium": "sns_post",
    "utm_campaign": "2026_10_14_friends",
    "utm_content": null,
    "utm_term": null
}
```

| 필드 | 규칙 |
| --- | --- |
| `touch_id` | 필수, 앞뒤 공백 제거 후 1~128자. 같은 접점 재전송 시 유지 |
| `captured_at` | 필수, 접점을 실제 수집한 UTC ISO 8601 시각 (`Z`). 서버 시각보다 최대 5분 앞선 값까지 허용하며 초과 시 `400`. 서버는 밀리초 형식으로 정규화하며, 재전송 시 새 시각을 만들지 않음 |
| UTM 다섯 필드 | 각 값은 문자열 또는 `null`. 생략·빈 문자열은 `null`, 앞뒤 공백 제거 후 최대 512자. 대소문자는 유지 |

다섯 UTM 중 최소 하나가 있어야 한다. `user_id`, `userId`, `model`, `scope`, 임의의 URL 등 계약에 없는 필드는 거부한다. **UTM 없는 직접 방문에서는 호출하지 않는다.**

**갱신 정책**

- `firstMarketingTouch`: 계정에 처음 저장된 유효 접점을 보존한다. 나중에 과거 접점이 도착해도 바꾸지 않는다. 전체 기기의 가장 오래된 방문을 역산하는 의미는 아니다.
- `lastMarketingTouch`: 기존 값이 없거나 새 `captured_at`이 더 클 때만 접점 전체를 교체한다. 생략한 `utm_campaign` 등을 과거 값으로 보충하지 않는다.
- 시각이 같거나 더 오래된 요청은 기존 값을 반환한다. 같은 요청 재시도는 저장 결과를 바꾸지 않는다.
- 같은 사용자의 동시 요청은 트랜잭션의 행 잠금으로 순서를 정한다. 접점이 바뀐 경우에만 `updated_at`을 갱신한다.
- 수집 시각은 클라이언트가 제공한다. 서버 시각보다 5분을 초과해 앞선 접점은 저장 전에 거부한다. 과거 접점은 기간 제한 없이 받아 기존 병합 규칙을 적용하며, 재시도·로그인 시각으로 임의 변경하지 않는다.

**Response `200`**

```json
{
    "success": true,
    "data": {
        "userId": 1,
        "firstMarketingTouch": {
            "touch_id": "a622a8bf-bc12-4782-bd84-c89b01389d5c",
            "captured_at": "2026-10-15T09:00:00.000Z",
            "utm_source": "instagram",
            "utm_medium": "sns_post",
            "utm_campaign": "2026_10_14_friends",
            "utm_content": null,
            "utm_term": null
        },
        "lastMarketingTouch": {
            "touch_id": "a622a8bf-bc12-4782-bd84-c89b01389d5c",
            "captured_at": "2026-10-15T09:00:00.000Z",
            "utm_source": "instagram",
            "utm_medium": "sns_post",
            "utm_campaign": "2026_10_14_friends",
            "utm_content": null,
            "utm_term": null
        }
    }
}
```

**오류**: `400 / 910001` 잘못된 접점, `401` 인증 실패, `404 / 960001` 존재하지 않거나 탈퇴한 계정.

### 프론트 이벤트와의 연결

`GET /users/me` 또는 동기화 응답의 `lastMarketingTouch`를 이벤트 공통 문맥에 적용한다.

```ts
const attribution = profile.lastMarketingTouch
    ? {
          ...profile.lastMarketingTouch,
          model: 'last_marketing_touch',
          scope: 'user',
      }
    : null
```

로그인 전에는 클라이언트가 보관한 접점에 `scope: 'anonymous'`를 사용한다. 회원 식별 후에는 동일한 `anonymous_id`와 `user_id`를 가진 식별 이벤트로 이전 행동을 연결한다. 로그아웃·다른 계정으로 전환할 때 이전 사용자의 접점과 뒤늦게 도착한 응답이 새 사용자에게 적용되지 않도록 한다.

매 이벤트마다 API를 호출하지 않는다. 이벤트 큐에 넣는 순간 접점 스냅샷을 고정하므로, 계정 UTM을 갱신해도 과거 이벤트가 바뀌지 않는다. 다른 기기의 변경은 다음 계정 동기화에서 반영된다.

### 적용 순서

현재 코드와 `drizzle/0014_user_marketing_attribution.sql`만 준비한 상태다. 실제 DB 적용·서버 배포는 별도다. 적용할 때는 **nullable 컬럼 추가 → 서버 API 배포 → 프론트 계정 동기화 활성화** 순서로 진행한다. 기존 계정의 UTM을 추측해서 채우는 백필은 하지 않는다.
