# 비즈니스 이벤트 수집

회원가입, 첫 링크 저장, 반복 사용을 유입별로 분석하기 위한 공통 이벤트 계약이다. 웹·앱·확장 프로그램은 사용자 행동을, 서버는 처리 결과를 기록한다.

```text
웹·앱·확장 프로그램 큐 ── Cognito 임시 자격 증명 ─┐
                                                 ├→ Firehose → S3 Parquet → Athena → Grafana
서버 큐 ──────────────── 런타임 IAM ──────────────┘
```

리소스 설정, 서버 전송 사용법과 비용은 [분석 인프라](./analytics.md)에서 관리한다.

대기 이벤트는 각 실행 환경의 메모리 큐에 보관한다. 프로세스가 종료되면 미전송 이벤트는 사라지며 다음 실행에서 복원하지 않는다.

## 공통 이벤트

| 필드 | 타입·의미 |
| --- | --- |
| `schema_version` | 정수. 현재 `1` |
| `event_id` | 사건의 고유 ID. 재전송해도 유지하며 집계 시 중복 제거에 사용 |
| `event_name` | 비어 있지 않은 사건 이름 |
| `source` | 기록 주체: `server`, `web`, `app`, `extension` |
| `platform` | 요청·행동이 시작된 환경: `web`, `app`, `extension` 또는 `null` |
| `environment` | 배포 환경: `development`, `production` |
| `occurred_at` | 사건 발생 시각, ISO 8601 UTC 문자열 |
| `anonymous_id` | 브라우저·앱 설치·확장 프로그램의 익명 식별자 또는 `null` |
| `user_id` | 서비스 회원 ID의 문자열 표현. 비로그인은 `null` |
| `session_id` | 실행 세션 식별자 또는 `null` |
| `operation_id` | 클라이언트 행동과 서버 처리를 잇는 작업 ID 또는 `null` |
| `attribution` | 이벤트 발생 시점의 마케팅 접점 객체 또는 `null` |
| `properties_json` | 이벤트별 속성을 직렬화한 JSON 문자열 |

호출부는 이벤트별 속성을 `properties` 객체로 전달하고, 공통 전송 코드가 `properties_json`으로 변환한다. 공통 필드는 속성 안에 중복해서 넣지 않는다. 이메일·토큰·메모·페이지 본문·URL 전체를 자동 수집하지 않는다.

아래는 Firehose에 전송되는 레코드 예시다. `source=server, platform=web`은 웹 요청을 처리한 서버가 기록한 사건을 뜻한다.

```json
{
  "schema_version": 1,
  "event_id": "b8f2244d-f76e-41d2-bc19-b54d2c414b46",
  "event_name": "link_saved",
  "source": "server",
  "platform": "web",
  "environment": "production",
  "occurred_at": "2026-10-14T09:00:00.000Z",
  "anonymous_id": "anon_001",
  "user_id": "123",
  "session_id": "session_001",
  "operation_id": "operation_001",
  "attribution": {
    "touch_id": "touch_001",
    "model": "last_marketing_touch",
    "scope": "user",
    "captured_at": "2026-10-13T03:00:00.000Z",
    "utm_source": "instagram",
    "utm_medium": "social",
    "utm_campaign": "launch_october",
    "utm_content": "landing_a",
    "utm_term": null
  },
  "properties_json": "{\"link_id\":\"456\",\"entry_point\":\"create_link\"}"
}
```

이벤트 ID, 발생 시각, 사용자와 UTM은 큐에 넣을 때 고정한다. 로그인·계정 전환·재시도로 대기 이벤트의 문맥을 바꾸지 않는다. `source`는 분석용 구분이며 인증된 발생 주체를 보장하는 필드는 아니다.

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
| `model` | 이벤트에 적용한 선택 기준: `last_marketing_touch` |
| `scope` | 접점 출처: 비로그인 저장소 `anonymous`, 계정 `user` |

비로그인 접점은 플랫폼 저장소에 보관하고, 로그인 후 계정과 동기화한다. 계정에는 최초 접점과 최근 접점을 각각 저장하며 이후 이벤트에는 최근 접점을 적용한다. `model`·`scope`는 이벤트에서 추가하고 계정 접점에는 저장하지 않는다. 값이 없는 UTM 필드는 `null`이다.

- 최초 접점은 계정에 처음 저장된 유효 접점을 보존한다.
- 최근 접점은 `captured_at`이 더 큰 경우에만 전체 교체한다. 동일·과거 시각의 재전송과 UTM 없는 직접 방문은 기존 값을 유지한다.
- 계정 접점 변경은 이후 이벤트에 적용한다. 이전 이벤트의 UTM 스냅샷은 유지한다.
- 다른 기기의 변경은 다음 계정 동기화에서 반영한다. 매 이벤트마다 계정 API를 호출하지 않는다.

UTM은 접점 연결 정보다. 전환 집계에는 별도로 기여 기간을 적용하며, 신규 앱 설치를 거친 유입 연결은 딥링크·어트리뷰션 처리가 필요하다.

계정 동기화의 요청·응답과 검증 규칙은 [사용자 API](../api/user.md#마케팅-접점-동기화)를 참고한다.

## 비로그인 행동 연결

```text
랜딩 방문   anonymous_id=A, user_id=null
회원 식별   anonymous_id=A, user_id=123
이후 행동   anonymous_id=A, user_id=123
```

클라이언트는 회원 조회 성공 시 `identity_identified`에 익명 ID와 회원 ID를 함께 기록한다. 분석에서는 이 연결 시점을 사용하고, 이미 `user_id`가 있는 이벤트는 해당 값을 우선한다. 로그아웃·계정 전환 시 익명 ID를 회전하고 이전 계정의 접점을 비워 계정 간 행동이 섞이지 않게 한다.

## 클릭·노출과 화면 이벤트

명시적으로 등록한 훅만 수집한다. 웹·확장 프로그램은 `data-label`과 DOM 이벤트·가시성을 연결하고, 앱은 같은 label을 `onPress`·화면 가시성과 연결한다. label은 화면 문구와 독립적인 고정 이름이며 반복 항목은 `item_id`로 구분한다. 훅 사용법은 클라이언트 레포의 `docs/analytics.md`에서 관리한다.

| 이벤트 | 속성 |
| --- | --- |
| `component_clicked` | `label`, `screen_name`, `screen_view_id`, `item_id` |
| `component_impression` | 클릭과 같은 대상 식별 필드 |
| `screen_viewed` | `screen_name`, `screen_view_id` |
| `screen_exited` | 화면 식별 필드, `duration_ms`, `exit_reason` |
| `link_save_requested` | 클라이언트의 링크 저장 요청. 서버 저장 성공과 구분 |
| `identity_identified` | 공통 필드의 `anonymous_id`, `user_id` |

노출은 활성 화면에서 대상 면적의 **40% 이상이 연속 1초** 보이면 기록한다. 조건이 깨지면 시간을 다시 측정하고, `screen_view_id + label + item_id`마다 한 번 기록한다. 중첩된 클릭 대상은 가장 가까운 등록 대상만 수집한다.

화면 이동·숨김·백그라운드 전환 시 방문을 종료하고 보이는 구간의 체류시간만 기록한다. 복귀하면 새 `screen_view_id`를 만든다. `screen_name`은 라우트 패턴 또는 고정 이름을 사용한다. `exit_reason`은 `navigation`, `hidden`, `background`, `pagehide`, `close`, `unmount`다.

현재 클라이언트의 `session_id`는 실행 중 유지하고 새로고침·앱 재실행·패널 재열기 때 새로 만든다. 화면 방문 수와 세션 수를 구분하고, 이탈 이벤트가 없는 방문의 체류시간은 미측정으로 처리한다.

## 집계 기준

- 회원가입·링크 저장 성공은 서버의 처리 결과로 집계한다. 저장 요청 이벤트를 성공 전환으로 세지 않는다.
- 첫 저장은 기존 저장 이력을 포함해 판단하거나 수집 시작 이후 가입 코호트로 범위를 제한한다.
- 재시도에 따른 중복은 `event_id`로 제거한다.
- 노출 후 클릭률은 노출된 고유 대상 중 클릭된 대상의 비율이다. 반복 클릭을 제거하고 노출 전에 발생한 클릭은 별도로 구분한다.
- 과거 지표는 이벤트 당시 사용자·UTM·발생 시각을 기준으로 계산한다.
