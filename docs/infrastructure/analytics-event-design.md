# 비즈니스 이벤트 수집 설계

작성일: 2026-10-14. 상태: 운영용 CDK와 서버 이벤트 큐·전송 모듈 구현, 미배포. 계정 UTM API와 서버 비즈니스 이벤트 발행은 후속 작업이다.

회원가입, 첫 링크 저장, 반복 사용을 유입별로 분석한다. 웹·앱·확장 프로그램의 행동과 서버의 처리 결과를 공통 이벤트로 기록하고, 각 실행 환경의 이벤트 큐 → Amazon Data Firehose → S3 → Athena → Grafana로 분석한다. 초기 구성에서 Kinesis Data Streams는 제외한다. 데이터 파이프라인 구축과 제품·마케팅 분석 학습을 함께 목표로 한다.

Cognito·Firehose·S3·Glue·Athena의 운영용 CDK와 공통 이벤트 전송 모듈을 구현했다. 계정 UTM API와 실제 비즈니스 이벤트 호출부 연결, AWS 배포는 후속 작업이다. RUM·APM과 승인 대기 중인 Session Replay는 별도 관측 영역이다.

## 1. 합의한 방향과 미결정 사항

| 구분 | 내용 |
| --- | --- |
| 합의 | Redash 대신 Grafana + Athena를 비즈니스 대시보드에 사용 |
| 합의 | 클라이언트·서버별 이벤트 큐에서 Firehose로 직접 배치 전송하고 S3에 적재 |
| 합의 | 서버·웹·앱·확장 프로그램을 공통 이벤트 필드로 구분 |
| 합의 | 사용자·UTM은 공통 필드, 이벤트별 속성은 `properties` JSON |
| 합의 | 비로그인 행동과 가입·로그인 이후 행동 연결 |
| 합의 | 클릭·노출은 명시적으로 등록한 훅과 안정적인 label로 수집 |
| 합의 | 기본 노출 기준은 활성 화면에서 대상의 40% 이상이 연속 1초 보일 때, 화면 방문당 대상별 1회 |
| 합의 | 수집 API 없이 클라이언트가 Cognito 임시 자격 증명으로 Firehose에 직접 전송 |
| 합의 | 서버도 런타임 IAM 권한으로 같은 스트림에 전송. 발생 주체는 `source`로 구분 |
| 합의 | 계정 최초·최근 마케팅 접점 저장, 직접 재방문은 최근 접점을 덮어쓰지 않음 |
| 미결정 | UTM 전환 기여 인정 기간, 향후 발행 보장 강화·환경 확장 정책 |

## 2. 현재 코드와 연결 지점

서버는 NestJS + Express이며 Lightsail Docker Compose로 배포한다. [CDK 진입점](../../infra/bin/promise9-infra.ts)은 Access, Lightsail, Queue, Email, Assets 스택을 구성한다. [AnalyticsStack](../../infra/lib/analytics-stack.ts)에 운영용 Cognito·Firehose·S3·Glue·Athena 정의를 추가했다. 아직 배포하지 않았으며 실제 AWS 계정의 리소스 상태는 검증하지 않았다.

- [QueueStack](../../infra/lib/queue-stack.ts)의 SQS·DLQ는 링크 분석 재시도 전용이다.
- [AssetsStack](../../infra/lib/assets-stack.ts)의 S3는 정적 자산용이다. 분석용 버킷은 AnalyticsStack에서 별도로 구성한다.
- [AuthService](../../src/modules/auth/auth.service.ts)는 소셜 로그인 결과에 `isNewUser`를 반환한다. 신규 가입과 기존 로그인 구분의 연결 지점이다.
- [LinkService](../../src/modules/link/link.service.ts)는 링크 저장 후 콘텐츠·AI 분석을 비동기로 시작한다. 저장 성공과 분석 완료는 다른 사건이다.
- 프론트 형제 레포 `Promise.9-Web`은 Expo 앱·웹과 `extension/`의 확장 프로그램을 관리한다. `shared/`의 API·도메인 구조를 공통 수집 코드의 후보 위치로 삼고, 저장소·생명주기 처리는 플랫폼별로 분리한다.

## 3. 수집 흐름과 책임

```text
웹·앱·확장 프로그램
  이벤트 생성 → 각 환경의 이벤트 큐 → 배치 전송 (Cognito 임시 자격 증명)
                                         ↓
                             공용 Firehose DirectPut 스트림
                                         ↑
서버 이벤트 생성 → 서버 이벤트 큐 → 배치 전송 (런타임 IAM)
                                         ↓
                             S3 Parquet + Glue Catalog
                                         ↓
                                       Athena
                                         ↓
                                       Grafana
```

| 기록 주체 | 사건 예시 | 의미 |
| --- | --- | --- |
| 웹 | 유입, 화면 방문, 노출·클릭 | 브라우저에서 관찰한 행동 |
| 앱 | 화면 방문, 딥링크 진입, 공유 저장 시작 | 앱에서 관찰한 행동 |
| 확장 프로그램 | 패널 열기, 저장 클릭, 결과 표시 | 확장 프로그램에서 관찰한 행동 |
| 서버 | 회원 생성, 로그인 성공, 링크 저장 성공 | 서비스에서 확정된 결과 |

클라이언트의 저장 클릭과 서버의 저장 성공은 별도 이벤트다. 성공 전환의 기준은 서버 이벤트로 두어 이중 집계를 피한다. 클라이언트 코드에서는 행동 이벤트를, 서버 코드에서는 확정 이벤트를 생성하도록 이벤트 목록과 호출 지점을 구분한다. `source`는 분석용 구분 필드이며 AWS가 인증한 발생 주체를 뜻하지 않는다.

이벤트 수집 API는 만들지 않는다. 공통 전송 코드가 이벤트 이름·버전·속성·배치 크기를 검사하고 이벤트를 큐에 넣는다. 배치 전송기가 Firehose `PutRecordBatch`를 호출한다. Firehose는 사용자·UTM 필드를 자동 보충하지 않으며, 이벤트의 의미·속성 검증은 공통 코드가 담당한다. Parquet 변환 단계에서는 Glue 스키마를 적용한다.

### Cognito와 전송 권한

- 클라이언트 설정에는 공개 식별자인 Identity Pool ID, 리전, 스트림 이름을 둔다.
- Cognito Identity Pool의 게스트 접근으로 비로그인 상태부터 임시 자격 증명을 발급받는다. AWS SDK의 credential provider가 발급·갱신과 요청 서명을 처리하도록 구성한다.
- 클라이언트 역할에는 대상 스트림의 `firehose:PutRecordBatch` 권한을 부여한다. 초기 설계는 단건 API를 사용하지 않고 이벤트가 하나여도 배치 API로 보낸다.
- 서버는 기존 런타임 IAM 주체에 같은 스트림의 쓰기 권한을 추가해 직접 전송한다. Cognito를 거치지 않는다.
- 장기 AWS Access Key·Secret Key를 클라이언트 설정에 넣지 않는다. 클라이언트가 사용하는 것은 Cognito가 발급한 임시 자격 증명이다.

기존 서비스 로그인은 유지한다. Cognito Identity ID는 서비스 `user_id`나 분석용 `anonymous_id`와 별개다. 서비스 로그인 후에도 이벤트의 사용자 문맥은 기존 로그인 결과로 갱신하며, 이벤트 전송만을 위해 Cognito User Pool로 인증을 이전하지 않는다. [AWS SDK Cognito 자격 증명 문서](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-browser-credentials-cognito.html)

## 4. 공통 이벤트 계약 초안

아래는 서버가 생성하는 이벤트 예시다. 클라이언트도 같은 공통 계약으로 이벤트를 생성한다. 수집 서버의 정규화 단계는 없으며, 각 producer가 전송 전에 공통 필드를 구성한다.

```json
{
  "schema_version": 1,
  "event_id": "evt_example_001",
  "event_name": "link_saved",
  "source": "server",
  "platform": "web",
  "environment": "production",
  "occurred_at": "2026-10-14T09:00:00.000Z",
  "anonymous_id": "anon_example_001",
  "user_id": "123",
  "session_id": "session_example_001",
  "operation_id": "operation_example_001",
  "attribution": {
    "touch_id": "touch_example_001",
    "model": "last_marketing_touch",
    "scope": "user",
    "captured_at": "2026-10-13T03:00:00.000Z",
    "utm_source": "instagram",
    "utm_medium": "social",
    "utm_campaign": "launch_october",
    "utm_content": "landing_a",
    "utm_term": null
  },
  "properties": {
    "link_id": "456",
    "entry_point": "create_link",
    "has_reminder": true
  }
}
```

| 필드 | 규칙 |
| --- | --- |
| `schema_version` | 공통 계약 버전. 구버전 데이터 해석 가능성을 유지 |
| `event_id` | 논리적 사건 한 건의 고유 ID. 재시도·재전송에서도 유지 |
| `event_name` | 사건 이름. 이벤트 목록에서 허용한 이름 사용 |
| `source` | `server`, `web`, `app`, `extension`: 기록 주체 |
| `platform` | `web`, `app`, `extension`: 행동이 발생한 제품 표면. 서버 자체 작업은 `null` |
| `environment` | 실행 환경. 각 producer의 배포 설정으로 지정 |
| `occurred_at` | UTC 사건 발생 시각. 클라이언트 시각은 오차 가능성을 고려 |
| `received_at` | producer 페이로드에서 제외. 적재 시각이 필요하면 AWS 도착 메타데이터로 파생하는 저장 전용 필드로 설계하며, 추출 방식은 미결정 |
| `anonymous_id` | 브라우저 프로필·앱 설치·확장 프로그램 설치별 식별자. 사람의 영구 ID가 아님 |
| `user_id` | 서비스 회원 ID의 문자열 표현. 비로그인은 `null`. 클라이언트는 로그인 결과의 사용자 정보, 서버는 인증 문맥으로 설정 |
| `session_id` | 사용 세션 식별자. 만료·갱신 규칙은 미결정 |
| `operation_id` | 클릭·API 처리 등 동일 작업의 연결 ID. 적용 불가능하면 `null` |
| `attribution` | 이벤트 발생 시 적용할 마케팅 접점 스냅샷. 없으면 `null` |
| `properties` | 이벤트별 JSON 객체. 공통 필드 중복 저장 금지 |

서버 이벤트의 `platform`은 원 요청의 문맥을 전달받아 기록한다. `source=server, platform=extension`이면 확장 프로그램 요청의 처리 결과다. OS·앱 버전·릴리즈 버전은 공통 문맥 필드 확장 후보이며 필수 범위는 구현 전에 정한다.

## 5. UTM과 계정 접점

### 접점 필드

| 필드 | 의미 |
| --- | --- |
| `touch_id` | 한 번의 마케팅 유입 접점 ID |
| `captured_at` | 접점 포착 시각 |
| `utm_source` | 유입 출처 |
| `utm_medium` | 채널 유형 |
| `utm_campaign` | 캠페인 |
| `utm_content` | 소재·링크 구분 |
| `utm_term` | 키워드 구분 |
| `model` | 예시: `last_marketing_touch`. 적용한 접점 선택 기준 |
| `scope` | `anonymous`는 비로그인 저장소, `user`는 계정 접점에서 가져온 값 |

UTM은 임의의 `properties`에 섞지 않고 공통 `attribution`에 둔다. 값이 없는 필드는 `null`로 구분한다. 계정 API는 다섯 UTM 필드만 허용하며 각 512자 이내로 앞뒤 공백을 제거한다. 빈 문자열·생략한 필드는 `null`이다. URL 전체·쿼리 전체는 저장하지 않는다.

### 갱신 정책

1. 비로그인 유입에서는 플랫폼 저장소에 접점을 기록한다.
2. 계정에는 `first_marketing_touch`와 `last_marketing_touch`를 구분해 보관한다. 최초 마케팅 접점과 최초 서비스 방문은 같은 개념이 아니다.
3. 새 유효 UTM 접점이 들어오면 최근 접점을 갱신한다. UTM 없는 직접 방문은 기존 마케팅 접점을 유지한다.
4. UTM은 접점 전체를 교체한다. 새 source에 과거 campaign을 합치지 않는다.
5. 가입·로그인 시 비로그인 접점을 계정과 연결한다. 다른 디바이스에서 더 최근 접점이 이미 저장되어 있을 수 있으므로 `captured_at`이 더 큰 경우에만 마지막 접점을 교체한다. 동률은 기존 값을 유지한다.
6. 이벤트에는 적용된 접점을 복사한다. 계정 접점이 나중에 바뀌어도 기존 이벤트는 변경하지 않는다.

계정 UTM의 저장·조회·동기화는 서비스 API의 책임이다. 후속 PR에서 `users.first_marketing_touch`·`last_marketing_touch`에 nullable JSONB로 보관한다. 최초 접점은 첫 저장 후 유지하고, 마지막 접점은 더 최근 `captured_at`인 경우에만 전체를 교체한다. 동시 요청은 사용자 행 잠금으로 직렬화한다. 동일·과거 시각의 재시도는 값을 바꾸지 않는다.

기기 시계 오류로 미래 접점이 최근 유입 갱신을 막지 않도록, 계정 동기화 API는 서버 시각보다 최대 5분 앞선 `captured_at`까지만 허용한다. 초과하면 저장 전에 `400`으로 거부한다. 과거 접점은 기간 제한 없이 기존 병합 규칙을 적용하며, 수집 시각을 서버 수신 시각으로 바꾸지 않는다.

로그인 성공 후 또는 로그인 상태의 새 UTM 유입 시 `PATCH /users/me/attribution`으로 동기화한다. `GET /users/me`와 PATCH 응답의 `lastMarketingTouch`를 받아 `model: last_marketing_touch`, `scope: user`를 붙여 이벤트에 사용한다. 비로그인 이벤트는 로컬 접점과 `scope: anonymous`를 사용한다. 매 이벤트마다 서버를 호출하지 않으며 다른 디바이스의 접점 변경은 다음 동기화에서 반영된다. 자세한 API 문서는 계정 UTM 구현 PR에서 추가한다.

오프라인 배치가 늦게 도착해도 큐에 넣을 때 동결한 이벤트 문맥을 유지한다. 수신 시점의 최신 계정 UTM으로 과거 이벤트를 덮어쓰지 않는다. 클라이언트가 제공한 UTM과 수집 시각은 서버가 확정한 비즈니스 사실과 구분한다.

접점 보존 기간과 전환 기여 인정 기간은 별개다. 분석에서 7일·30일 등 기간을 적용할 수 있도록 접점 시각을 보존한다. 구체적인 기간은 아직 확정하지 않았다. UTM 연결은 마케팅이 행동을 유발했다는 인과관계의 증명이 아니다.

앱에는 실제 전달된 딥링크 정보만 기록할 수 있다. 신규 설치를 거친 UTM 전달은 자동으로 해결되지 않으며 MMP·디퍼드 딥링크는 별도 범위다.

## 6. 비로그인과 회원 행동 연결

```text
랜딩 방문       anonymous_id=A, user_id=null
가입 시작       anonymous_id=A, user_id=null
회원가입 완료   anonymous_id=A, user_id=123
링크 저장       anonymous_id=A, user_id=123
```

가입·로그인 요청 등 기존 서비스 통신에 익명 ID 문맥을 전달하고, 성공 시 서버에서 익명 ID와 사용자 ID의 연결 시각을 기록한다. 연결 이력을 Athena에 제공하는 방식은 서버 연결 이벤트 또는 별도 적재 중 결정한다. 수집 API 없이도 서비스 인증 흐름에서 연결할 수 있다. S3 과거 이벤트를 수정하지 않고 Athena에서 연결 이력을 이용한다. 이미 `user_id`가 있는 이벤트는 해당 값을 우선한다.

동일 브라우저의 계정 전환을 고려해 `anonymous_id → user_id`를 영구적인 단일 매핑으로 취급하지 않는다. 연결 구간·로그아웃 처리·소급 연결 범위를 정해야 하며 다른 계정의 행동까지 합치지 않는다. 브라우저·앱·확장 프로그램의 익명 ID는 자동으로 같아지지 않는다. 다른 플랫폼 간 연결은 인증 또는 명시적인 연결 흐름이 있을 때 수행한다.

탈퇴 시 계정 접점·연결 이력·분석 데이터의 삭제 또는 비식별 처리 정책도 함께 정해야 한다.

## 7. 클릭과 노출 훅

### 사용 형태

```tsx
// API 형태 예시. 반환값과 컴포넌트 연결 방식은 미정이다.
const tracking = useTrack({
  label: "landing.hero.signup",
  click: true,
  impression: true,
});
```

훅은 공통 수집 코드에 행동을 전달한다. 호출부는 사용자·UTM·세션을 매번 직접 채우지 않는다. 웹과 확장 프로그램에서는 `data-label`을 부여하고 DOM 이벤트·가시성을 연결한다. 앱은 동일한 label을 `onPress`·화면 상태·목록 가시성 정보와 연결한다. DOM이 없는 네이티브에 `data-label` 속성 자체를 강제하지 않는다.

| 규칙 | 내용 |
| --- | --- |
| 대상 등록 | 명시적으로 등록한 대상만 수집 |
| label | 표시 문구와 분리된 안정적인 이름. 텍스트·사용자 ID·URL을 label로 만들지 않음 |
| 반복 항목 | 동일 label을 사용하고 `item_id` 등 별도 속성으로 개체 구분 |
| 클릭 | `component_clicked`. 중첩 대상·이벤트 버블링·훅과 전역 수집의 중복 방지 |
| 노출 | `component_impression`. 마운트와 구분 |
| 화면 방문 | `screen_view_id`로 같은 화면의 재방문 구분 |

### 합의한 기본 노출 기준

- 화면이 활성화되어 있어야 한다. 백그라운드 탭·앱은 제외한다.
- 대상 면적의 40% 이상이 연속 1초 보이면 노출로 기록한다.
- 가시성 조건이 중간에 깨지면 연속 시간 측정을 다시 시작한다.
- 동일 화면 방문에서 동일 대상은 1회만 기록한다. 재렌더·가상화 목록의 재마운트로 중복 기록하지 않는다.
- 대상의 논리적 식별은 `screen_view_id + label + item_id 또는 placement_id`를 후보로 한다. 정확한 필드 계약은 구현 전에 확정한다.
- 뷰포트보다 큰 대상 등 기본 기준 적용이 어려운 경우 예외를 명시적으로 논의한다.

```json
{
  "event_name": "component_clicked",
  "properties": {
    "label": "landing.hero.signup",
    "screen_name": "landing",
    "screen_view_id": "view_example_001",
    "placement_id": "hero",
    "item_id": null
  }
}
```

노출 이벤트에도 같은 대상 식별 필드를 남긴다. 클릭 횟수와 노출 후 클릭 전환율은 다른 지표다. 후자는 노출된 고유 대상 중 클릭된 대상의 비율로 계산하고 반복 클릭은 중복 제거한다. 1초 전에 클릭한 경우 노출 없이 클릭이 존재할 수 있다. 이를 버리거나 강제로 노출을 만들지 않고 별도 확인할 수 있게 보존한다. 최종 지표의 포함 기준은 분석 정의에 명시한다.

### 화면 진입·이탈과 체류시간

웹·앱·확장은 화면 진입을 `screen_viewed`, 이탈을 `screen_exited`로 기록한다. 두 이벤트의 `properties_json`에 같은 `screen_name`, `screen_view_id`를 넣고, 이탈에는 `duration_ms`(밀리초 정수)와 `exit_reason`을 추가한다. 웹·앱 화면 이름은 라우트 패턴이며 실제 동적 URL은 기록하지 않는다.

- 체류시간은 실제로 보이는 구간만 측정한다. 웹·확장 문서가 숨겨지거나 앱이 inactive/background로 전환되면 이탈을 기록한다.
- 복귀하면 같은 화면이어도 새 `screen_view_id`로 진입하고 체류시간과 대상 노출 판정을 다시 시작한다. 기존 `session_id`는 유지한다.
- 화면 이동은 이전 화면 이탈 → 다음 화면 진입 순서다. 같은 경로의 재렌더·UTM 쿼리 변경만으로는 새 방문을 만들지 않는다.
- `exit_reason`은 `navigation`, `hidden`, `background`, `pagehide`, `close`, `unmount`다. 연속되는 숨김·종료 신호는 같은 방문을 중복 종료하지 않는다.
- 예를 들어 10초 사용 → 백그라운드 1분 → 복귀 후 5초 사용은 방문 2개와 체류시간 10,000ms·5,000ms로 기록한다. 이 방문 구간 수를 세션 수나 라우트 이동 횟수와 혼용하지 않는다.
- 이탈은 페이지 이동·숨김도 포함하므로 최종 사이트 이탈률과 다르다. 강제 종료나 전송 실패로 이탈 이벤트가 없는 방문은 체류시간 0이 아닌 미측정으로 구분한다.

종료 신호를 받으면 이탈을 큐에 먼저 넣고 flush를 시도한다. 기존 메모리 큐 정책상 브라우저·앱 종료 시 전달을 보장하지 않는다. 속성은 기존 `properties_json`에 저장하므로 이 추가만으로 Glue 테이블이나 CDK를 변경하지 않는다. 구체적인 연결은 [프론트 수집 문서](../../../Promise.9-Web/docs/analytics.md)를 참고한다.

## 8. properties와 분석 스키마

`properties`는 JSON 객체지만 자유로운 무제한 데이터 덤프가 아니다. 이벤트별 필수·선택 속성과 타입을 목록으로 관리한다. 예를 들어 `link_saved`는 `link_id`, `entry_point`, `has_reminder`를 후보로 한다. 메모·토큰·페이지 본문 같은 내용을 자동으로 포함하지 않는다.

저장 초안은 공통 필드와 UTM을 타입이 있는 컬럼 또는 구조체로 두고, 이벤트별 속성은 `properties_json` 문자열로 직렬화하는 방식이다. 훅이 받는 `properties` 객체를 공통 전송 코드가 Firehose 전송 전에 `properties_json` 문자열로 직렬화하는 안을 제안한다. 서버도 같은 저장 계약으로 직렬화한다. Firehose가 임의 객체를 자동으로 문자열화한다고 가정하지 않는다.

Athena에서는 JSON 속성을 추출하는 뷰를 제공한다. 자주 쓰는 속성은 검증 후 타입 컬럼으로 승격할 수 있다. 이 방식은 속성 추가를 유연하게 하지만 JSON 내부 필드별 컬럼 스캔 최적화에는 한계가 있다.

Firehose의 JSON → Parquet 변환은 Glue 테이블의 스키마를 사용한다. 스키마에 없는 속성은 변환 결과에서 빠질 수 있으므로 원본 JSON 보관 여부와 스키마 변경 절차를 정해야 한다. Glue classification만으로 변환·조회 역할이 자동 결정되는 것은 아니다. Parquet는 컬럼 기반 파일 형식이다. [AWS 형식 변환 문서](https://docs.aws.amazon.com/firehose/latest/dev/record-format-conversion.html)

## 9. 이벤트 큐와 Firehose 배치 전송

이벤트 발생 즉시 `track()`이 공통 문맥을 확정하고 해당 실행 환경의 큐에 넣는다. 전송기는 시간·건수·직렬화 크기를 기준으로 배치를 만들어 Firehose에 보낸다. 이벤트 큐는 앱 내부의 대기 저장소와 전송 로직을 뜻하며, 별도 SQS나 Kinesis를 추가한다는 의미가 아니다.

| 영역 | 큐와 전송 책임 |
| --- | --- |
| 웹 | 브라우저 저장소 기반 대기 큐, 사용 중 주기적 전송. 여러 탭의 중복 소비 방지 |
| 앱 | 설치 단위 영속 큐, 오프라인 보관, 백그라운드 전환·재실행 시 전송 |
| 확장 프로그램 | 확장 프로그램 저장소 기반 큐. 팝업·패널·백그라운드 간 전송 책임 통합 |
| 서버 | 메모리 큐와 배치 전송기. 최대 10,000건·직렬화 데이터 16MiB, 강제 종료 시 미전송 이벤트 유실 허용 |

클라이언트 저장소 구현은 프론트 작업에서 관리한다. 서버는 메모리 큐로 시작하며 프로세스 강제 종료 시 대기 이벤트 유실을 허용한다. 서버의 DB 저장과 이벤트 큐 기록 사이의 누락까지 줄이려면 outbox가 후보이며 별도 합의 후 구현한다.

### 전송 절차

1. 이벤트 생성 시 `event_id`, 사용자, UTM, 발생 시각을 고정한다. 로그인·계정 변경 이후 전송되더라도 기존 문맥을 바꾸지 않는다.
2. 큐에 저장하고 전송 대상 배치를 선택한다. 동일 큐에서 전송 작업이 중첩되지 않게 한다.
3. 클라이언트는 Cognito 임시 자격 증명, 서버는 런타임 IAM으로 `PutRecordBatch`를 호출한다.
4. 응답의 `FailedPutCount`와 항목별 결과를 확인해 성공한 이벤트만 큐에서 제거한다. 이는 Firehose 수락 완료이며 S3 적재 완료는 아니다.
5. 실패 항목은 백오프와 지터를 적용해 재시도한다. 응답 전체를 받지 못하면 같은 `event_id`로 다시 보내고 분석에서 중복 제거한다.
6. 자격 증명 갱신·네트워크·throttling 실패에도 큐를 유지한다. 큐 크기·보관 기간 초과와 영구적인 잘못된 이벤트는 별도 처리하고 폐기 수치를 남긴다.

배치 API는 최대 500레코드 또는 4MiB이며 단일 레코드 한도는 base64 인코딩 전 1,000KiB다. 초기 앱 설정은 이보다 작게 잡고 실제 직렬화 바이트 크기를 검사한다. 이벤트 하나를 Firehose 레코드 하나로 보내며, 여러 이벤트를 하나의 JSON 배열로 합치는 방식은 초기 범위에서 제외한다. flush 간격·건수·큐 상한은 실측 후 결정한다. [Firehose 배치 API](https://docs.aws.amazon.com/firehose/latest/APIReference/API_PutRecordBatch.html)

### 처리량과 적재 지연

서울 리전 Direct PUT 기본 한도는 스트림 전체 합산 초당 1,000요청, 100,000레코드, 1MiB다. 먼저 도달하는 한도가 적용된다. 배치는 요청 수를 줄이지만 데이터 바이트는 줄이지 않는다. 이벤트당 1KiB이면 데이터 기준 초당 약 1,024건이며, 하루 100만 건은 평균 약 11.6건/초다. 평균보다 피크와 동시 재전송량으로 용량을 검증한다.

Firehose는 throttling 발생 시 처리량 한도를 자동 증설할 수 있지만 즉시 증가한다고 가정하지 않는다. 큰 유입이 예상되면 사전 한도 증설을 검토한다. [AWS 한도](https://docs.aws.amazon.com/firehose/latest/dev/limits.html)

클라이언트 배치와 Firehose의 S3 적재 버퍼는 별개다. producer가 전송을 마쳐도 Parquet 파일 생성까지 시간이 걸린다. S3 전달 장애 시 DirectPut은 최대 24시간 보관·재시도하며 그 이상 지속되면 유실될 수 있다. 변환 실패는 S3 오류 경로에 기록하고 재처리한다. 종료·저장소 삭제·장기 장애까지 포함한 무손실을 보장하지 않는다. [전달 실패 처리](https://docs.aws.amazon.com/firehose/latest/dev/retry.html)

## 10. CDK 구성안

기존 `infra`에 분석 전용 `Promise9AnalyticsStack`을 추가했다. 운영용 1세트이며 아래 구성은 로컬 합성까지 검증했다. 상세 사용법은 [분석 인프라](./analytics.md)를 참고한다. 기존 분석 재시도용 SQS와 정적 자산용 S3는 재사용하지 않는다.

| 리소스 | 초기 구성안 |
| --- | --- |
| Cognito Identity Pool | 게스트 접근 활성화. User Pool은 만들지 않음 |
| 클라이언트 IAM Role | Cognito Identity Pool에 연결. trust에 해당 pool의 `aud`와 `unauthenticated` 조건 적용. 대상 delivery stream의 `firehose:PutRecordBatch` 허용 |
| 서버 쓰기 정책 | 기존 `Promise9AppRuntime` 사용자에 동일 delivery stream의 `firehose:PutRecordBatch` 허용 |
| Firehose Delivery Stream | `DeliveryStreamType=DirectPut`, 서버·웹·앱·확장 프로그램 공용 |
| Firehose 서비스 역할 | `firehose.amazonaws.com`이 사용. 대상 S3 적재·필요한 Glue 스키마 조회·로그 쓰기 권한 |
| Firehose 변환 | JSON → Parquet, Glue 명시 스키마, Snappy 압축. 변환 Lambda 없이 producer가 `properties_json` 직렬화 |
| Firehose 버퍼 | 64MiB / 300초. 버퍼 힌트이며 정확한 전달 시간 SLA는 아님 |
| 분석 S3 | 공개 차단, SSE-S3, HTTPS, 스택 삭제 시 RETAIN. `events/`와 `errors/` 분리 |
| 쿼리 결과 S3 | Athena 결과 전용 버킷, 공개 차단·SSE-S3·HTTPS |
| Glue | Database 1개, 이벤트 Table 1개. CDK로 스키마 명시, 초기 Crawler·ETL Job 제외 |
| Athena | SQL Workgroup, 결과 경로·암호화 강제, 쿼리당 1GiB 스캔 제한, 사용량 지표 활성화 |
| Grafana 조회 권한 | Athena 쿼리 실행·결과 조회, Glue 조회, 이벤트 S3 읽기와 쿼리 결과 경로 읽기·쓰기. 인증 방식은 연결 시 확정 |
| 모니터링 | Firehose 적재 실패·지연·throttling과 producer 큐 실패·폐기 관찰. 로그 보존 기간·알람 임계값은 미정 |
| CDK Outputs | Identity Pool ID, 리전, Firehose 이름·ARN, S3 이름, Glue DB·Table, Athena Workgroup |

서버 IAM 사용자는 현재 QueueStack이 소유한다. 사용자 logical ID·소유 스택은 유지하고 AnalyticsStack의 별도 정책 리소스에서 기존 사용자에 권한을 붙이는 안이다. 기존 SQS·SES 정책을 덮어쓰지 않는다. Cognito 역할은 서버 IAM 사용자와 별도로 만든다.

Kinesis 리소스·샤드·Kinesis 읽기 권한은 초기 구성에 없다. 운영용 1세트로 구성하며 서버·클라이언트별 스트림 분리는 하지 않는다. 기존 스택처럼 프로젝트 태그·termination protection·삭제 정책을 명시하는 방향이다.

### S3 경로와 보존 후보

```text
분석 데이터 버킷
  events/arrival_date=2026-10-14/*.parquet
  errors/type=.../arrival_date=2026-10-14/...
쿼리 결과 버킷
  query-results/...
```

정상 경로는 `events/arrival_date=!{timestamp:yyyy-MM-dd}/`, 오류 경로는 `errors/type=!{firehose:error-output-type}/arrival_date=!{timestamp:yyyy-MM-dd}/`를 후보로 한다. UTC를 사용한다. Firehose 기본 timestamp 표현식으로 날짜 경로를 만들고 유료 동적 파티셔닝은 초기에는 사용하지 않는다.

이 timestamp는 해당 파일에서 가장 오래된 레코드의 대략적인 도착 시각이다. 개별 이벤트의 발생 날짜나 정확한 수신 시각을 나타내지 않는다. 분석 시간은 `occurred_at`을 사용하고, 자정 경계·지연 도착을 고려해 파티션 조회 범위를 잡는다. [Firehose 경로 규칙](https://docs.aws.amazon.com/firehose/latest/dev/s3-prefixes.html)

Athena는 `arrival_date`의 date partition projection과 storage location template을 설정하는 안이다. 데이터 시작일부터 조회 가능 범위를 정의하고 초기에는 Crawler나 매일 파티션 등록 작업을 두지 않는다. `source`, `platform`, `event_name`은 파티션이 아닌 컬럼으로 유지한다.

정상 이벤트 `events/`는 자동 삭제 없이 보관한다. 변환 오류 `errors/`와 Athena 쿼리 결과 `query-results/`는 객체 생성 후 7일이 지나면 lifecycle 만료 대상이 된다. 실제 삭제 시점은 S3의 비동기 처리에 따른다. 두 S3 버킷의 스택 삭제·교체 정책은 RETAIN이며, 이는 lifecycle 만료를 막지 않는다. CloudWatch 전달 진단 로그는 30일 보존한다. 쿼리 결과는 SQL 실행 산출물이고 과거 지표 재계산의 기준은 정상 이벤트 Parquet이므로, 결과 파일이 만료되어도 과거 이벤트를 다시 조회할 수 있다.

전체 원본 JSON 별도 보관은 구현하지 않았다. Parquet에 없는 필드까지 재처리해야 한다면 원본 보관 정책을 별도로 결정한다. 아래 비용표의 90일 보관은 비교 계산용 가정이며 실제 만료 설정이 아니다. 현재 정책에서는 시간이 지남에 따라 누적 저장량과 보관료가 늘어난다.

## 11. 첫 분석 범위와 검증

| 목표 | 분석 후보 |
| --- | --- |
| 회원가입 | 유입별 방문 → 가입 전환, 가입 시작 이후 이탈 |
| 첫 링크 저장 | 신규 가입 코호트의 첫 저장 비율과 소요 시간 |
| 반복 사용 | 가입 주차별 재방문·저장·열람 리텐션 |
| 컴포넌트 | label별 고유 노출, 클릭 횟수, 노출 후 클릭 전환율 |

첫 저장은 서버의 저장 성공 이력으로 계산하는 안이다. 도입 이전 가입·저장 이력이 있는 사용자는 수집 이후 최초 저장을 생애 첫 저장으로 오해하지 않도록 기준 데이터 또는 분석 시작 코호트를 정한다. 반복 사용을 저장·열람 중 어떤 사건으로 정의할지와 가입 후 24시간 등 전환 기간은 미결정이다.

구현 단계는 공통 계약·플랫폼별 이벤트 큐·Cognito 및 Firehose 배치 전송 → 웹과 서버의 가입·저장 연결 → 앱·확장 프로그램 → 노출·클릭 확대 순서를 제안한다. 다음 시나리오를 검증한다.

1. 비로그인 UTM 방문과 가입·첫 저장이 연결된다.
2. 새로운 UTM은 이후 이벤트에 적용되고 이전 이벤트는 유지된다.
3. 로그인·계정 전환 전후의 대기 이벤트가 다른 사용자에게 귀속되지 않는다.
4. 동일 `event_id` 재전송과 Firehose 부분 실패 재시도로 집계가 부풀지 않는다.
5. 노출 40%·연속 1초·활성 화면·방문당 1회 기준을 만족한다.
6. 플랫폼별 종료·오프라인·재실행, Cognito 자격 증명 발급·갱신 실패와 서버 발행 실패를 검증한다.
7. Athena 결과와 서버의 가입·저장 기준 데이터를 대조하고 Grafana에 표시한다.

## 12. 구현 전에 함께 결정할 항목

1. 플랫폼별 SDK·credential provider 호환성과 초기화·갱신, 배치·큐 정책.
2. 운영 배포 전 트래픽 예상과 비용 상한. 개발용 별도 파이프라인은 현재 범위 밖이다.
3. 서버 핵심 전환의 outbox 도입 여부와 미발행 이벤트 복구 방식.
4. 세션 만료, 로그아웃·계정 전환, 익명 행동 소급 연결 범위.
5. UTM 전환 기여 인정 기간과 장기 접점 이력 분석 필요성.
6. 이벤트 목록, label 규칙, JSON 크기·타입·중첩 제한.
7. 원본 보관·보존·삭제·재처리와 파티션·Glue 스키마 변경 정책.
8. 가입 전환·첫 저장·리텐션·클릭률의 정확한 집계 정의.

## 13. 서울 리전 비용 비교

2026-10-14 확인한 AWS 공개 가격 기준, USD, 세금·환율·계정 크레딧 제외. 초기 DirectPut → 일반 S3 구성에는 Kinesis 고정 비용이 없다. VPC 전달·동적 파티셔닝·변환 Lambda도 사용하지 않는 가정이다.

| 항목 | 서울 단가 또는 조건 |
| --- | --- |
| Cognito Identity Pool | 인증·식별자 생성 무료. User Pool 과금과 구분 |
| Firehose Direct PUT 수집 | 첫 구간 $0.036/GB |
| Firehose Parquet 변환 | $0.022/GB |
| S3 Standard | 첫 50TB 구간 $0.025/GB·월 |
| S3 PUT 계열 | $0.0045/1,000요청 |
| S3 GET 계열 | $0.00035/1,000요청 |
| Athena SQL | 스캔 $5/TB |
| Glue Catalog | 첫 100만 객체·월 100만 요청 무료 범위 가정. Crawler·ETL 미사용 |
| 비교용 Kinesis Provisioned | 1샤드 $0.0185/시간, PUT payload unit 100만 개당 $0.0204 |

### 계산 가정과 결과

- 하루 이벤트 수 × 30일. 공통 필드·속성을 포함한 직렬화 이벤트당 1KiB.
- 이벤트 1개 = Firehose 레코드 1개. 수집과 형식 변환 모두 레코드별 5KiB 올림 적용.
- `PutRecordBatch`로 여러 레코드를 묶어도 건별 5KiB 과금은 줄어들지 않는다.
- Parquet는 입력 크기의 30%로 가정하고 90일 누적 보관 상태 계산. 실제 압축률은 실측 필요.
- Athena는 세 시나리오 모두 월 100GiB 스캔으로 가정. 이벤트 수에 비례한 예측이 아니다.
- 비교용 Kinesis는 월 730시간, 1샤드, 기본 24시간 보존, EFO 미사용.

| 일일 이벤트 | 월 이벤트 | Firehose 수집·변환 | S3 Parquet 저장 | Athena | 직접 전송 주요 비용 합계 | Kinesis 경유 비교 합계 |
| --- | --- | --- | --- | --- | --- | --- |
| 1만 | 30만 | $0.08 | $0.01 | $0.49 | **$0.58** | $14.09 |
| 10만 | 300만 | $0.83 | $0.06 | $0.49 | **$1.38** | $14.95 |
| 100만 | 3,000만 | $8.30 | $0.64 | $0.49 | **$9.43** | $23.55 |

월 이벤트 수를 N으로 두면 계산식은 다음과 같다. 각 항목을 반올림하기 전 합산한다.

```text
원본 GiB = N × 1024 / 1024^3
Firehose 청구 GiB = N × 5120 / 1024^3
Firehose = 청구 GiB × (0.036 + 0.022)
S3 저장 = 원본 GiB × 0.30 × 3개월 × 0.025
Athena = 100 / 1024 × 5
비교용 Kinesis 추가분 = 730 × 0.0185 + N / 1,000,000 × 0.0204
```

합계에서 S3 요청·오류 및 쿼리 결과 저장·CloudWatch·외부 데이터 전송·Grafana 요금은 제외했다. 비용 상한을 보장하는 표가 아니다. 90일보다 오래 보관하면 누적 저장 비용이 늘고, Grafana에서 반복 조회하면 Athena 스캔 비용이 늘어난다. 쿼리당 스캔 제한과 느린 갱신 주기·수동 갱신을 후보로 두고 비용 알림을 설정한다. 예산 알림 자체는 비용을 차단하지 않는다.

단가 근거:

- [Cognito 가격](https://aws.amazon.com/cognito/pricing/)
- [Firehose 과금·건별 올림 규칙](https://aws.amazon.com/firehose/pricing/), [서울 Firehose 가격 JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonKinesisFirehose/current/ap-northeast-2/index.json)
- [서울 S3 가격 JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-northeast-2/index.json)
- [서울 Athena 가격 JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonAthena/current/ap-northeast-2/index.json)
- [Glue 가격](https://aws.amazon.com/glue/pricing/)
- [서울 Kinesis 가격 JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonKinesis/current/ap-northeast-2/index.json)

## 14. 이후 Kinesis를 앞단에 추가하는 선택

초기 구성에서는 필요하지 않지만 다음 요구가 생기면 Kinesis Data Streams를 앞단에 추가할 수 있다.

- 보존 기간 안의 원본 이벤트를 특정 시점부터 다시 읽고 싶을 때.
- Firehose 외에 실시간 처리기 등 여러 소비자가 동일 이벤트를 독립적으로 읽어야 할 때.
- 목적지 장애에 대비한 스트림 보존 기간을 24시간보다 늘려야 할 때.

```text
현재: 각 producer의 큐 → Firehose DirectPut → S3 → Athena → Grafana
확장: 각 producer의 큐 → Kinesis → Firehose KinesisStreamAsSource → S3 → Athena → Grafana
                              └→ 추가 실시간 소비자
```

클라이언트·서버 큐, 공통 이벤트, UTM, 훅은 유지하고 전송 대상과 권한을 변경한다. 그때 Kinesis 스트림·partition key·용량·보존 기간을 정하고 Firehose에 Kinesis 읽기 권한을 부여한다. 큐는 네트워크 장애·재시도를 처리하므로 Kinesis 도입 후에도 필요하다.

전환은 단순히 기존 DirectPut 스트림 앞에 연결선을 추가하는 작업이 아니다. Firehose 소스 유형 변경 가능 여부와 CDK 교체 계획을 확인하고, 필요하면 Kinesis 소스의 새 Firehose를 만들어 전환한다. 이미 배포된 앱·확장 프로그램의 구버전은 기존 endpoint에 계속 보낼 수 있으므로 전환 기간에는 두 경로를 수용하고 `event_id`로 중복을 제거한다. 기존 큐를 소진하고 버전별 사용량을 확인한 뒤 이전 경로를 종료한다. 스키마·S3 경로·Athena 조회 범위의 호환성도 유지한다.

Kinesis는 Firehose의 단순 부하 우려만으로 추가하지 않는다. 먼저 실제 피크·재시도와 Firehose 한도를 확인한다. Kinesis도 producer에서 AWS에 도달하기 전 누락을 해결하지 않으며, 기본 24시간 보존 그대로라면 DirectPut 대비 장애 대응 기간이 자동으로 늘지는 않는다. 스트림 재읽기·다중 소비자·보존 확장이 추가 고정 비용을 감수할 이유다.

## 참고

- 사용자가 제공한 「데이터 수집 flow」: client → Kinesis → Firehose → S3 Parquet → Athena → Redash. 최종 초기안은 Kinesis를 제외한 Firehose 직행이며 대시보드는 Grafana다. Kinesis는 선택 확장으로 남긴다.
- [AWS SDK Cognito 임시 자격 증명](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-browser-credentials-cognito.html)
- [Grafana Athena SQL 편집기](https://grafana.com/docs/plugins/grafana-athena-datasource/latest/query-editor/)
- [AWS Firehose 형식 변환](https://docs.aws.amazon.com/firehose/latest/dev/record-format-conversion.html)
- [Firehose 배치 전송과 부분 실패](https://docs.aws.amazon.com/firehose/latest/APIReference/API_PutRecordBatch.html)

### 서버 구현 진행 상태

서버 공통 전송 모듈을 구현했다. 큐는 사용자 결정에 따라 메모리에 보관하며,
강제 종료 시 미전송 이벤트 유실을 허용한다. 구체적인 큐 한도·배치·재시도·환경변수는
[인프라 및 서버 운영 문서](./analytics.md#서버-이벤트-전송-코드)에 정리했다.
계정 UTM 저장·조회·동기화 API와 nullable JSONB 컬럼 마이그레이션은 후속 PR에서 구현한다. 프론트의 공통 수집 코드 연결은 별도 작업에서 진행한다. 실제 DB 마이그레이션 적용과 배포는 수행하지 않았다. 실제 서버 비즈니스 이벤트 호출부는 별도 연결이 필요하다.
