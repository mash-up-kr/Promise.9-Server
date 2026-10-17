# API 명세서 — 사용자 (User)

> [API 명세 인덱스](./api-spec.md) · [공통 응답](./common.md)

두 API 모두 JWT 인증이 필요하며 사용자 ID는 토큰에서 얻는다.

## 내 정보 조회

```http
GET /users/me
Authorization: Bearer <accessToken>
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
        "utm": null
    }
}
```

`utm`은 계정에 저장된 최근 접점만 담은 아래 `MarketingTouch` 객체다. 저장된 접점이 없으면 `null`을 반환하며 최초 접점은 응답에 포함하지 않는다.

## 마케팅 접점 동기화

```http
PATCH /users/me/attribution
Authorization: Bearer <accessToken>
Content-Type: application/json
```

비로그인 중 보관한 접점은 로그인 성공 후, 로그인 상태의 새 접점은 수집 직후 동기화한다. UTM 없는 직접 방문에서는 호출하지 않는다.

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

| 필드 | 검증 |
| --- | --- |
| `touch_id` | 필수. 앞뒤 공백 제거 후 1~128자 |
| `captured_at` | 필수. UTC ISO 8601 시각(`Z`), 밀리초 형식으로 정규화. 서버보다 최대 5분 앞선 값까지 허용 |
| UTM 다섯 필드 | 문자열 또는 `null`. 앞뒤 공백 제거 후 최대 512자. 생략·빈 문자열은 `null`, 대소문자 유지 |

다섯 UTM 중 하나 이상이 필요하며 본문에는 위 필드만 허용한다. 재전송 시 `touch_id`·`captured_at`을 유지한다. 과거 접점은 기간 제한 없이 받는다.

**Response `200`** — 공통 응답의 `data`:

| 필드 | 타입·동작 |
| --- | --- |
| `userId` | 회원 ID, number |
| `utm` | `MarketingTouch \| null`. 동기화 후 계정에 저장된 최근 접점 |

첫 유효 접점은 DB의 최초·최근 접점 양쪽에 저장한다. 이후 최초 접점은 보존하고, 더 최근 `captured_at`의 접점으로만 최근 접점 전체를 교체한다. 두 API 모두 최근 접점만 `utm`으로 반환한다.

동일·과거 시각의 요청에는 저장된 최근 접점을 반환한다. 생략한 UTM을 과거 값으로 보충하지 않으며 접점이 바뀔 때만 `updated_at`을 갱신한다.

**오류**: `400 / 910001` 잘못된 접점, `401` 인증 실패, `404 / 960001` 존재하지 않거나 탈퇴한 계정.

## 이벤트에서 사용

프론트의 공통 수집 코드가 조회·동기화 응답의 `userId`를 문자열 `user_id`로, `utm`을 이벤트의 최상위 `utm`으로 사용한다. 접점에는 `model: 'last_marketing_touch'`, `scope: 'user'`를 추가한다. 계정 접점과 새 로컬 접점이 모두 없으면 `utm=null`이다. 계정 API는 현재 값을 반환하고, 이벤트에는 발생 당시 값을 보관한다.

비로그인 또는 계정 동기화 대기 중인 새 로컬 접점에는 `scope: 'anonymous'`를 사용한다. 계정에 저장된 값을 전달받으면 이후 이벤트부터 적용하고, 큐에 이미 들어간 이벤트의 UTM은 바꾸지 않는다. 각 클릭·노출·성공 이벤트마다 계정 API를 호출하지 않는다. 사용자 연결과 동기화 흐름은 [공통 이벤트 계약](../infrastructure/analytics-event-design.md)을 참고한다.

## 적용 순서

`0014_user_marketing_attribution.sql`로 nullable 컬럼 추가 → 서버 API 배포 → 클라이언트 계정 동기화 활성화. 기존 계정은 접점 없이 시작하며 백필하지 않는다.
