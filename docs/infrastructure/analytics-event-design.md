# 비즈니스 이벤트 수집

회원가입, 첫 링크 저장, 반복 사용을 유입별로 분석하기 위한 공통 이벤트 계약이다. 웹·앱·확장 프로그램이 행동과 API 성공 결과를 기록하고, 서버는 계정 UTM을 저장·조회한다.

```text
웹·앱·확장 프로그램 ── UTM 동기화 API ── 계정 DB
        │                  ↓ 저장된 UTM 응답
        └─ 공통 이벤트 + 사용자·세션·UTM 스냅샷
                ↓ 메모리 큐 · Cognito 임시 자격 증명
             Firehose → S3 Parquet → Athena → Grafana
```

CDK는 수집·저장·조회 리소스를 구성하고, 클라이언트의 공통 수집 코드가 이벤트 문맥과 배치 전송을 담당한다. 리소스 설정과 비용은 [분석 인프라](./analytics.md)에서 관리한다.

대기 이벤트는 각 실행 환경의 메모리 큐에 보관한다. 프로세스가 종료되면 미전송 이벤트는 사라지며 다음 실행에서 복원하지 않는다.

## 공통 이벤트

최상위 필드는 14개다. 클라이언트는 아래 계약으로 전송하고 Glue는 같은 필드·타입으로 Parquet을 만든다. 배포 전 계약이므로 `schema_version`은 `1`을 유지한다.

| 필드 | 타입·의미 |
| --- | --- |
| `schema_version` | 정수. 현재 `1` |
| `event_id` | 사건의 고유 ID. 재전송해도 유지하며 집계 시 중복 제거에 사용 |
| `event_name` | 비어 있지 않은 사건 이름 |
| `occurred_at` | 사건 발생 시각, ISO 8601 UTC 문자열 |
| `source` | 이벤트를 기록한 클라이언트: `web`, `app`, `extension` |
| `environment` | 배포 환경: `development`, `production` |
| `anonymous_id` | 브라우저·앱 설치·확장 프로그램의 익명 식별자 또는 `null` |
| `user_id` | 서비스 회원 ID의 문자열 표현. 비로그인은 `null` |
| `session_id` | 실행 세션 식별자 또는 `null` |
| `os` | 정규화한 운영체제 이름. 예: `ios`, `android`, `windows`, `macos`, `linux`. 판별 실패는 `unknown` |
| `browser` | 정규화한 브라우저 이름. 예: `chrome`, `safari`, `firefox`, `edge`. 판별 실패는 `unknown`, 네이티브 앱은 `null` |
| `client_version` | 실행 중인 웹 배포·앱·확장 버전 문자열. 확인할 수 없으면 `null` |
| `utm` | 이벤트 발생 시점의 마케팅 접점 객체 또는 `null` |
| `custom_data` | 이벤트별 속성을 직렬화한 JSON 문자열. Glue/Athena 컬럼 타입은 `string` |

`client_version`은 웹 배포 버전·커밋 식별자 또는 앱·확장의 실제 버전이다. 이벤트 형식을 나타내는 `schema_version`과 구분한다. 원본 User-Agent, 이메일·토큰·메모·페이지 본문·URL 전체는 자동 수집하지 않는다.

### 이벤트별 속성

호출부는 `custom_data`에 이벤트별 JSON 객체를 전달하고 공통 직렬화기가 이를 문자열로 바꾼다. 중첩 객체·배열을 포함할 수 있고, 속성이 없는 이벤트는 `"{}"`를 전송한다. 모든 이벤트에 강제되는 공통 하위 속성은 없다. 이벤트별 타입은 `link_saved.link_id`, `signup_completed.provider`처럼 필요한 속성을 필수로 정할 수 있다.

자동·수동 수집 여부로 속성의 위치를 나누지 않는다. 클릭·노출 훅은 해당 이벤트에 필요한 `label`, `item_id`, `screen_name`, `screen_view_id`, 화면 크기·스크롤 값을 `custom_data`에 채울 수 있다. 공통 수집 코어가 이 속성을 모든 이벤트에 주입하지 않으며, 사용자·세션·UTM도 중복해서 넣지 않는다.

| 이벤트별 객체 예 | 전송할 `custom_data` |
| --- | --- |
| 속성 없음 | `"{}"` |
| 링크 저장 결과 | `"{\"link_id\":456,\"entry_point\":\"create_link_sheet\"}"` |
| 중첩된 실험 속성 | `"{\"experiment\":{\"id\":\"landing\",\"variant\":\"a\"},\"placements\":[\"hero\",\"footer\"]}"` |

`context` 객체와 중복 `platform` 필드는 두지 않는다. 큐 상태·재시도 횟수·배치 ID·flush 사유·collector·`operation_id` 같은 수집·실행 내부 상태를 이벤트나 `custom_data`에 기본 기록하지 않는다. 작업 중 사용자·UTM 스냅샷이나 확장 요청의 상관관계가 필요하면 수집기 내부 메타데이터로 유지한다.

아래는 웹에서 저장 API 성공을 확인한 뒤 Firehose에 전송할 레코드 예시다.

```json
{
  "schema_version": 1,
  "event_id": "b8f2244d-f76e-41d2-bc19-b54d2c414b46",
  "event_name": "link_saved",
  "occurred_at": "2026-10-14T09:00:00.000Z",
  "source": "web",
  "environment": "production",
  "anonymous_id": "anon_001",
  "user_id": "123",
  "session_id": "session_001",
  "os": "ios",
  "browser": "safari",
  "client_version": "web-2026.10.14.1",
  "utm": {
    "touch_id": "touch_001",
    "captured_at": "2026-10-13T03:00:00.000Z",
    "utm_source": "instagram",
    "utm_medium": "social",
    "utm_campaign": "launch_october",
    "utm_content": "landing_a",
    "utm_term": null
  },
  "custom_data": "{\"link_id\":456,\"entry_point\":\"create_link_sheet\"}"
}
```

이벤트 ID, 발생 시각, 사용자·UTM·실행 환경·`custom_data`는 큐에 넣을 때 고정한다. 로그인·계정 전환·재시도로 대기 이벤트의 값을 바꾸지 않는다. 요청 중 계정이나 UTM이 바뀌어도 해당 요청의 성공 이벤트는 요청 시점에 확보한 문맥을 사용하고, 새 `event_id`와 실제 성공 시각을 기록한다. `source`는 분석용 구분이며 인증된 발생 주체를 보장하는 필드는 아니다.

계정 API의 `utm`은 현재 계정에 저장된 최근 접점이고, 이벤트의 `utm`은 해당 이벤트가 발생했을 때 적용한 접점의 스냅샷이다.

## UTM과 계정 접점

| 필드 | 의미 |
| --- | --- |
| `touch_id` | 마케팅 유입 접점 ID |
| `captured_at` | 접점을 수집한 UTC 시각 |
| `utm_source` | 사용자를 서비스로 연결한 플랫폼·매체 |
| `utm_medium` | 광고·일반 게시물·이메일 등 유입 방식 |
| `utm_campaign` | 동일한 목적과 기획으로 진행한 마케팅 활동 |
| `utm_content` | 소재·링크 구분 |
| `utm_term` | 키워드 구분 |

이벤트의 `utm`은 계정 API와 같은 일곱 필드의 `MarketingTouch` 객체다. 최근 마케팅 접점을 사용하는 `last_marketing_touch` 정책을 적용하며 `model`·`scope`는 전송하지 않는다. 값이 없는 UTM 필드는 `null`이다.

비로그인 접점은 플랫폼 저장소에 보관하고, 로그인 후 계정과 동기화한다. 첫 유효 접점은 계정의 `firstMarketingTouch`와 `lastMarketingTouch` 양쪽에 저장한다. API는 최근 접점만 `utm`으로 반환하며 이후 이벤트에 적용한다.

1. UTM 링크로 들어오면 클라이언트가 `touch_id`, `captured_at`, UTM 다섯 필드를 로컬에 저장하고 이벤트의 `utm`으로 사용한다.
2. 로그인 후 내 정보에서 회원 ID와 계정 접점을 조회한다. 로컬에 미동기화 접점이 있으면 계정 UTM API로 저장한다.
3. 조회·저장 응답의 `utm`을 그대로 공통 수집기에 보관한다. 과거 접점을 보낸 경우에도 요청값 대신 서버 응답을 적용한다. UTM 없는 다른 기기의 로그인도 이 값을 사용한다.
4. 각 이벤트를 큐에 넣을 때 문맥의 `user_id`, `anonymous_id`, `session_id`, `utm`을 복사한다. 클릭·노출 훅이나 성공 처리마다 UTM을 따로 조합하지 않는다.

동기화 대기 중에는 더 최근인 로컬 접점을 사용한다. 로컬·계정 출처 구분은 수집기 내부 상태로 유지하며 `user_id`로 추론하지 않는다. 인증 확인 중 계정 접점 제거, 로컬 접점 복원, 미동기화 접점 보존을 유지한다. 동기화에 실패하면 로컬 접점을 보존해 다음 동기화에서 재시도하고, 성공한 요청의 `touch_id`만 대기 상태에서 해제한다. 접점이 전혀 없으면 `utm=null`이다.

- 최초 접점은 계정에 처음 저장된 유효 접점을 보존한다.
- 최근 접점은 `captured_at`이 더 큰 경우에만 전체 교체한다. 동일·과거 시각의 재전송과 UTM 없는 직접 방문은 기존 값을 유지한다.
- 계정 접점 변경은 이후 이벤트에 적용한다. 이전 이벤트의 UTM 스냅샷은 유지한다.
- 다른 기기의 변경은 다음 계정 동기화에서 반영한다. 매 이벤트마다 계정 API를 호출하지 않는다.

UTM은 접점 연결 정보다. 전환 집계에는 별도로 기여 기간을 적용하며, 신규 앱 설치를 거친 유입 연결은 딥링크·어트리뷰션 처리가 필요하다.

## 비로그인 행동 연결

```text
랜딩 방문   anonymous_id=A, user_id=null
회원 식별   anonymous_id=A, user_id=123
이후 행동   anonymous_id=A, user_id=123
```

클라이언트는 회원 조회 성공 시 `identity_identified`에 익명 ID와 회원 ID를 함께 기록한다. 분석에서는 이 연결 시점을 사용하고, 이미 `user_id`가 있는 이벤트는 해당 값을 우선한다. 로그아웃·계정 전환 시 익명 ID를 회전하고 이전 계정의 접점을 비워 계정 간 행동이 섞이지 않게 한다. 같은 계정의 여러 기기 분석은 `user_id`, 방문 흐름은 클라이언트의 `session_id`로 묶으며 서버 API에 분석 세션을 전달할 필요는 없다.

## 클릭·노출과 화면 이벤트

명시적으로 등록한 훅만 수집한다. 웹·확장 프로그램은 `data-label`과 DOM 이벤트·가시성을 연결하고, 앱은 같은 label을 `onPress`·화면 가시성과 연결한다. label은 화면 문구와 독립적인 고정 이름이며 반복 항목은 `item_id`로 구분한다. 훅 사용법은 클라이언트 레포의 `docs/analytics.md`에서 관리한다.

| 이벤트 | 이벤트별 `custom_data` |
| --- | --- |
| `component_clicked` | `label`, `screen_name`, `screen_view_id`, `item_id` |
| `component_impression` | 클릭과 같은 대상 식별 필드 |
| `screen_viewed` | `screen_name`, `screen_view_id` |
| `screen_exited` | 화면 식별 필드, `duration_ms`, `exit_reason` |
| `link_save_requested` | 정의한 요청 속성 또는 `{}`. API 성공 여부를 뜻하지 않음 |
| `identity_identified` | 정의한 식별 속성 또는 `{}`. 회원 연결에는 최상위 `anonymous_id`, `user_id`를 사용 |

위 속성은 각 이벤트의 정의이며 다른 이벤트에도 필수로 붙이지 않는다. 화면 크기가 필요하면 `viewport_width`, `viewport_height`를 웹 CSS px·앱 논리 단위로 기록한다. 스크롤을 측정하는 이벤트는 `scroll_depth_percent`, `max_scroll_depth_percent`를 `0`~`100`으로 기록할 수 있다. 미측정 값은 생략하거나 `null`로 두며 `0`으로 만들지 않는다.

노출은 활성 화면에서 대상 면적의 **40% 이상이 연속 1초** 보이면 기록한다. 조건이 깨지면 시간을 다시 측정하고, `screen_view_id + label + item_id`마다 한 번 기록한다. 중첩된 클릭 대상은 가장 가까운 등록 대상만 수집한다.

화면 이동·숨김·백그라운드 전환 시 방문을 종료하고 보이는 구간의 체류시간만 기록한다. 복귀하면 새 `screen_view_id`를 만든다. `screen_name`은 라우트 패턴 또는 고정 이름을 사용한다. `exit_reason`은 `navigation`, `hidden`, `background`, `pagehide`, `close`, `unmount`다.

현재 클라이언트의 `session_id`는 실행 중 유지하고 새로고침·앱 재실행·패널 재열기 때 새로 만든다. 화면 방문 수와 세션 수를 구분하고, 이탈 이벤트가 없는 방문의 체류시간은 미측정으로 처리한다.

## 집계 기준

성공 전환은 아래 시점에 클라이언트에서 기록한다. 현재 연결된 행동 수집에 추가할 이벤트이며 실제 호출부 연결은 별도 작업이다.

| 이벤트 | 기록 시점 |
| --- | --- |
| `signup_completed` | 로그인 API가 `isNewUser=true`를 반환한 직후 |
| `link_saved` | 링크 저장 API 성공 응답을 확인했을 때. 응답의 링크 ID를 `custom_data.link_id`에 숫자로 기록 |

가입 이벤트는 회원 ID 조회를 기다리지 않는다. 아직 회원 ID가 없으면 `user_id=null`과 `anonymous_id`로 기록하고, 이후 `identity_identified`를 이용해 조회 단계에서 회원과 연결한다.

- 저장 요청을 성공 전환으로 세지 않는다. API 호출이 실패하면 성공 이벤트를 기록하지 않는다.
- 서버 처리 후 클라이언트가 응답이나 전송을 놓치면 누락될 수 있다. 정확한 가입·저장 건수의 기준은 서비스 DB이며 이벤트는 행동·전환 분석에 사용한다.
- 첫 저장은 기존 저장 이력을 포함해 판단하거나 수집 시작 이후 가입 코호트로 범위를 제한한다.
- 재시도에 따른 중복은 `event_id`로 제거한다.
- 노출 후 클릭률은 노출된 고유 대상 중 클릭된 대상의 비율이다. 반복 클릭을 제거하고 노출 전에 발생한 클릭은 별도로 구분한다.
- 과거 지표는 이벤트 당시 사용자·UTM·발생 시각을 기준으로 계산한다.
