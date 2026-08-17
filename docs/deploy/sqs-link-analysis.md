# 링크 분석 SQS 설정

링크 저장 API는 정보 수집·AI 요약·AI 태그·임베딩을 응답 이후 인라인으로 실행하고, 실패한
작업만 `promise9-link-analysis` 큐에 넘겨 나중에 재시도한다. 즉 큐는 정상 경로가 아니라
**재시도 경로**이며, 모든 작업이 성공하면 SQS를 호출하지 않는다.

<br>

## 적용 엔드포인트

| 엔드포인트 | 분석 실행 | 비고 |
| --- | --- | --- |
| `POST /api/v1/links` | O | 링크 신규 저장. 유일한 실행 지점 |
| `PATCH /api/v1/links/:linkId` | X | 제목·폴더 등 수정만 하고 재분석하지 않는다(임베딩만 갱신) |
| `POST /api/v1/links/:linkId/restore` | X | 복원 시 기존 분석 결과를 그대로 쓴다 |

실행은 `LinkService.create()`가 `LinkAnalysisDispatcherService.dispatch()`를 호출하는 지점
하나뿐이다. 같은 `normalizedUrl`은 `assertNotDuplicated`가 먼저 막으므로 중복 실행되지 않는다.

<br>

## 작업 단위

분석은 아래 4개 작업으로 나뉘고, **재시도는 작업 단위로 이루어진다.** 요약이 성공하고 태그만
실패하면 태그만 다시 실행하므로 성공한 AI 호출이 중복 결제되지 않는다.

| 작업 | 내용 |
| --- | --- |
| `CONTENT` | 링크 크롤링 후 제목·설명 저장. 본문은 DB에 보관하지 않는다 |
| `SUMMARY` | AI 요약 생성 및 `aiSummary`·`aiSummaryStatus` 저장 |
| `TAGS` | AI 태그 생성 후 기존 AI 태그를 transaction에서 교체 |
| `EMBEDDING` | 검색용 벡터 생성 및 저장 |

`SUMMARY`·`TAGS`는 `CONTENT`의 수집 결과를 입력으로 쓴다. 본문을 저장하지 않으므로 이 두
작업만 재시도할 때는 크롤링을 다시 실행한다. `EMBEDDING`은 제목·요약이 저장된 뒤 최신 행을
다시 읽어 실행하므로 요약까지 반영된 벡터가 만들어진다.

<br>

## 동작 방식

```
POST /api/v1/links
  ├─ 링크 DB 저장
  ├─ 201 응답 — aiSummaryStatus=PENDING
  └─ dispatch()  ← fire-and-forget, 응답을 막지 않는다
       │
       └─ 인라인 실행: CONTENT → (SUMMARY, TAGS) → EMBEDDING
            ├─ 전부 성공 → 종료. SQS를 호출하지 않는다
            ├─ RETRYABLE 실패 → 실패한 작업만 담아 큐에 발행
            └─ PERMANENT 실패 → 큐에 넣지 않고 종료

        promise9-link-analysis 큐
                  │  long polling 20초, 한 번에 1건
                  ▼
        LinkAnalysisQueueConsumer → handleRetry()
          └─ 메시지의 tasks만 실행
               ├─ 전부 성공 → 메시지 삭제
               ├─ 일부 실패 → 남은 작업만 새 메시지로 재발행하고 원본 삭제
               └─ 시도 상한 초과 → 재발행 중단, 요약 상태를 FAILED로 확정
```

인라인 실행과 재시도 실행은 모두 `LinkAnalysisService.run(input, tasks)` 하나를 호출한다.
실행 로직은 한 곳에만 있고 트리거만 두 개다.

<br>

## 재시도 정책

`run()`은 예외를 던지지 않고 작업별 결과를 반환하며, 실패는 두 종류로 분류된다.

| 분류 | 조건 | 처리 |
| --- | --- | --- |
| `RETRYABLE` | 네트워크 오류, 타임아웃, 5xx, 429, provider 내부 오류 | 큐에 발행해 재시도 |
| `PERMANENT` | 429를 제외한 4xx | 재시도하지 않고 종료 |

재시도는 원본 메시지의 재전달이 아니라 **남은 작업만 담은 새 메시지 발행**으로 이루어진다.
따라서 시도 횟수는 SQS `maxReceiveCount`가 아니라 코드의 `LINK_ANALYSIS_MAX_ATTEMPTS`가
제한하며, 인라인 1회를 포함해 최대 4회 시도한다. 시도 간격은 `SendMessage`의 `DelaySeconds`로
60초 → 120초 → 240초(상한 900초)로 늘어난다.

상한을 넘기면 재발행을 멈추고, 실패 작업에 `SUMMARY`가 포함된 경우 `aiSummaryStatus`를
`FAILED`로 확정해 `PENDING` 고착을 막는다.

<br>

## 실패 처리

| 실패 지점 | 동작 |
| --- | --- |
| 인라인 실행 중 예외 | 로그만 남기고 저장 응답에 영향을 주지 않는다 |
| 재시도 메시지 발행 실패(인라인 경로) | 로그만 남긴다. 해당 링크는 재시도되지 않는다 |
| 재시도 메시지 발행 실패(consumer 경로) | 예외를 던져 원본 메시지를 삭제하지 않는다. SQS가 재전달하고 초과 시 DLQ로 이동 |
| 메시지 파싱 실패 | 삭제하지 않아 재전달되고 결국 DLQ로 이동한다 |
| 배포·재시작 | `enableShutdownHooks`로 진행 중인 인라인 작업을 최대 15초 기다린다 |

강제 종료(SIGKILL, OOM)로 인라인 실행이 끊기면 큐에 아무것도 없는 상태가 되어 그 링크는
`PENDING`에 남는다. 현재 규모에서는 이를 감수하고 sweeper를 두지 않는다. 관측이 필요하면
오래된 `PENDING` 건수를 확인한다.

```sql
select count(*) from links
where ai_summary_status = 'PENDING'
  and created_at < now() - interval '1 hour'
  and deleted_at is null;
```

<br>

## 권장 큐 설정

- Queue type: Standard
- Receive message wait time: 20초
- Visibility timeout: 300초 이상(작업 최대 실행 시간보다 길어야 함)
- Retention period: 4일
- DLQ: 별도 Standard queue 연결
- Redrive `maxReceiveCount`: 3

재시도 횟수는 코드가 제어하므로 `maxReceiveCount`는 파싱 실패와 발행 실패를 걸러내는
안전망 역할만 한다.

Standard queue는 같은 메시지를 두 번 이상 전달할 수 있다. 요약·수집 결과는 동일 `linkId`를
갱신하고 AI 태그는 transaction에서 교체하므로 중복 처리해도 최종 데이터가 중복되지 않는다.

<br>

## IAM 권한

애플리케이션이 사용하는 IAM principal에 대상 queue ARN으로 아래 권한을 부여한다.

- `sqs:SendMessage`
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`

AWS SDK 기본 credential provider chain을 사용하므로 액세스 키를 코드나 저장소에 넣지 않는다.
실행 환경의 IAM role을 우선 사용하고, 불가능한 환경에서만 안전하게 주입된
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를 사용한다.

<br>

## 환경변수

필수 설정은 `AWS_REGION`, `SQS_LINK_ANALYSIS_QUEUE_URL`이다. 한 애플리케이션 인스턴스가
API와 consumer를 함께 실행하는 것이 기본값이다. 발행만 담당할 인스턴스에서는
`SQS_CONSUMER_ENABLED=false`로 polling을 끌 수 있다. 전체 항목과 기본값은
`.env.example`을 참고한다.

`SQS_LINK_ANALYSIS_QUEUE_URL`이 없으면 인라인 실행은 정상 동작하지만 재시도 발행이 실패한다.
즉 큐 없이도 링크 저장과 분석은 되고, 일시적 실패에 대한 재시도만 사라진다.

배포 전에 visibility timeout과 코드의 `SQS_VISIBILITY_TIMEOUT_SECONDS`를 동일하게 맞추고,
DLQ redrive policy가 실제 source queue에 연결되어 있는지 확인한다.

<br>

## 관련 코드

| 파일 | 역할 |
| --- | --- |
| `src/modules/link/analysis/link-analysis.type.ts` | 작업 단위·실패 분류·메시지 포맷 정의 |
| `src/modules/link/analysis/link-analysis.service.ts` | 작업 실행. 인라인과 재시도가 공유 |
| `src/modules/link/analysis/link-analysis.dispatcher.ts` | 인라인 실행과 재시도 예약 조율 |
| `src/modules/link/analysis/link-analysis.failure.ts` | RETRYABLE·PERMANENT 분류 |
| `src/modules/link/analysis/link-analysis.queue.ts` | 재시도 메시지 발행 |
| `src/modules/link/analysis/link-analysis.consumer.ts` | 큐 polling과 재시도 처리 |
| `src/infrastructure/sqs/sqs.service.ts` | `SQSClient` 래퍼 |
| `src/config/environment.ts` | `SQS_*` 환경변수 검증 |
