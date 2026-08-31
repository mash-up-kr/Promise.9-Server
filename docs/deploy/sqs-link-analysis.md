# 링크 분석 SQS 설정

링크 저장 API는 정보 수집·AI 요약·AI 태그·임베딩을 응답 이후 인라인으로 실행하고, 실패한
작업만 `promise9-link-analysis` 큐에 넘겨 나중에 재시도한다. 즉 큐는 정상 경로가 아니라
**재시도 경로**이며, 모든 작업이 성공하면 SQS를 호출하지 않는다.

<br>

## 적용 엔드포인트

| 엔드포인트 | 실행하는 작업 | 비고 |
| --- | --- | --- |
| `POST /api/v1/links` | 전체(4개) | 링크 신규 저장 |
| `PATCH /api/v1/links/:linkId` | `EMBEDDING`만 | 메모가 바뀔 때만. 임베딩 텍스트가 달라지므로 재생성한다 |
| `POST /api/v1/links/:linkId/restore` | 없음 | 복원 시 기존 분석 결과를 그대로 쓴다 |

두 경로 모두 `LinkAnalysisDispatcher.dispatch()`를 호출한다. 실패 시 재시도 정책도 동일하게
적용되므로 임베딩 생성 트리거는 이 한 곳으로 통일되어 있다. 같은 `normalizedUrl`은
`assertNotDuplicated`가 먼저 막으므로 중복 실행되지 않는다.

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
               └─ 시도 상한 초과 → 재발행 중단하고 로그만 남긴다
```

인라인 실행과 재시도 실행은 모두 `LinkAnalysisService.run(input, tasks)` 하나를 호출한다.
실행 로직은 한 곳에만 있고 트리거만 두 개다.

<br>

## 재시도 정책

`run()`은 예외를 던지지 않고 작업별 결과를 반환하며, 실패는 두 종류로 분류된다.

| 분류 | 조건 | 처리 |
| --- | --- | --- |
| `RETRYABLE` | 네트워크 오류, 타임아웃, 5xx, 429, provider 내부 오류 | 큐에 발행해 재시도 |
| `PERMANENT` | 429를 제외한 4xx, LLM 설정 오류 | 재시도하지 않고 종료 |

AI 실패의 판단은 `AiService`가 `AiGenerationError.retryable`로 노출한다. 링크 분석 쪽은
provider 예외 타입을 알지 않고 이 값만 본다.

재시도는 원본 메시지의 재전달이 아니라 **남은 작업만 담은 새 메시지 발행**으로 이루어진다.
따라서 시도 횟수는 SQS `maxReceiveCount`가 아니라 코드의 `LINK_ANALYSIS_MAX_ATTEMPTS`가
제한하며, 인라인 1회를 포함해 최대 4회 시도한다. 시도 간격은 `SendMessage`의 `DelaySeconds`로
60초 → 120초 → 240초(상한 900초)로 늘어난다.

상한을 넘기면 재발행을 멈추고 로그만 남긴다. 각 작업의 실패 상태는 실행 시점에
`LinkAnalysisService`가 이미 기록하므로(요약 실패 시 `aiSummaryStatus=FAILED`) 여기서 다시
쓰지 않는다. 상태 전이의 주인을 한 곳으로 유지하기 위한 선택이다.

<br>

## 실패 처리

| 실패 지점 | 동작 |
| --- | --- |
| 인라인 실행 중 예외 | 로그만 남기고 저장 응답에 영향을 주지 않는다 |
| 재시도 메시지 발행 실패(인라인 경로) | 로그만 남긴다. 해당 링크는 재시도되지 않는다 |
| 재시도 메시지 발행 실패(consumer 경로) | 예외를 던져 원본 메시지를 삭제하지 않는다. SQS가 재전달하고 초과 시 DLQ로 이동 |
| 메시지 파싱 실패 | 삭제하지 않아 재전달되고 결국 DLQ로 이동한다 |
| 메시지 수신 실패(큐 URL 오류, IAM 권한 누락) | 연속 실패에 1초 → 30초 백오프를 적용해 폴링을 유지한다. 로그 폭주를 막는 장치이므로 큐 설정 오류는 로그를 보고 고쳐야 한다 |
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

## 큐 리소스

큐는 `infra/lib/queue-stack.ts`(CDK)가 정의한다. 콘솔에서 직접 만들지 않는다.

| 환경 | 큐 | DLQ |
| --- | --- | --- |
| production | `promise9-link-analysis` | `promise9-link-analysis-dlq` |

현재 배포 대상은 production 하나이므로 stage 큐를 별도로 생성하지 않는다. 기존
stage 큐와 DLQ는 `RemovalPolicy.RETAIN`이 적용돼 스택에서 제거해도 AWS에는 보존된다.
더 이상 필요하지 않은지 확인한 뒤 수동으로 삭제한다.

적용되는 설정은 아래와 같다.

- Queue type: Standard
- Receive message wait time: 20초 — long polling
- Visibility timeout: 300초 — 앱의 `SQS_VISIBILITY_TIMEOUT_SECONDS` 기본값과 동일
- Retention period: 4일(DLQ는 14일)
- Redrive `maxReceiveCount`: 3
- 저장 암호화: SQS 관리형 키(`SqsManagedSseEnabled`) — 메시지에 사용자 링크 URL이 담긴다
- 전송: HTTPS 강제(`aws:SecureTransport`)

재시도 횟수는 코드가 제어하므로 `maxReceiveCount`는 파싱 실패와 발행 실패를 걸러내는
안전망 역할만 한다.

배포는 `infra`에서 실행한다.

```bash
bun run diff Promise9QueueStack    # 변경 사항 확인
bun run deploy Promise9QueueStack  # 큐·DLQ·IAM 사용자 생성
```

스택 출력값 `ProductionQueueUrl`이 production의
`SQS_LINK_ANALYSIS_QUEUE_URL`에 넣을 값이다.

Standard queue는 같은 메시지를 두 번 이상 전달할 수 있다. 요약·수집 결과는 동일 `linkId`를
갱신하고 AI 태그는 transaction에서 교체하므로 중복 처리해도 최종 데이터가 중복되지 않는다.

<br>

## IAM 권한

큐 스택이 IAM 사용자 `Promise9AppRuntime`을 만들고, production 큐 ARN에만 아래
권한을 준다.

- `sqs:SendMessage`
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`

**Lightsail 인스턴스는 EC2처럼 IAM role을 붙일 수 없다.** 그래서 런타임이 액세스 키로
인증해야 하고, 앱은 AWS SDK 기본 credential provider chain을 통해 이 키를 읽는다.

액세스 키는 CloudFormation 템플릿과 스택 출력에 남지 않도록 **CDK에서 만들지 않는다.**
스택 배포 후 콘솔에서 `Promise9AppRuntime`의 키를 발급해 GitHub Secrets에 넣는다.
키는 코드나 저장소에 넣지 않는다.

<br>

## GitHub Secrets

배포 워크플로가 아래 secret을 `.env`로 내려보낸다. 값이 없는 항목은 아예 쓰지 않으므로,
secret을 설정하기 전에 배포해도 앱은 정상 부팅된다(재시도만 동작하지 않는다).

| Secret | 사용하는 워크플로 | 값 |
| --- | --- | --- |
| `AWS_REGION` | production | `ap-northeast-2` |
| `SQS_LINK_ANALYSIS_QUEUE_URL` | production | 스택 출력 `ProductionQueueUrl` |
| `AWS_ACCESS_KEY_ID` | production | `Promise9AppRuntime` 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | production | 같은 키의 시크릿 |

`AWS_*`에는 SQS 권한만 가진 `Promise9AppRuntime` 키를 사용한다. SES 발송 키는
`EMAIL_SES_*` secrets로 별도 관리하며 자세한 설정은 `docs/infrastructure/ses.md`를 따른다.

<br>

## 환경변수

필수 설정은 `AWS_REGION`, `SQS_LINK_ANALYSIS_QUEUE_URL`이다. consumer는 기본으로
비활성화되며, 실행할 인스턴스에서만 `SQS_CONSUMER_ENABLED=true`로 명시적으로
켠다. production 배포 워크플로는 큐 URL이 설정된 경우 이 값을 함께 주입한다.
전체 항목과 기본값은 `.env.example`을 참고한다.

development 환경에서 production 큐 URL과 `SQS_CONSUMER_ENABLED=true`를 함께 설정하면
앱이 부팅을 거부한다. 로컬 consumer를 테스트할 때는 `SQS_ENDPOINT`에 LocalStack 같은
AWS 호환 엔드포인트를 설정한다.

`SQS_LINK_ANALYSIS_QUEUE_URL`이 없으면 인라인 실행은 정상 동작하지만 재시도 발행이 실패한다.
즉 큐 없이도 링크 저장과 분석은 되고, 일시적 실패에 대한 재시도만 사라진다.

visibility timeout과 DLQ 연결은 큐 스택이 코드의 기본값과 맞춰 정의하므로 따로 확인할
필요는 없다. 큐 설정을 바꿀 때는 콘솔이 아니라 `infra/lib/queue-stack.ts`를 고친다.

<br>

## Consumer 워커 분리 기준

현재 production은 API와 SQS consumer를 한 프로세스에서 실행한다. 다음 중 하나라도
해당하면 consumer를 별도 워커로 분리한다.

- 큐 depth가 일시적 장애 후에도 0으로 복구되지 않는다.
- 재시도 처리 중 API p95 latency가 의미 있게 증가한다.
- API 인스턴스를 두 대 이상으로 확장해야 한다.
- 리마인드 배치 등 다른 백그라운드 작업이 같은 프로세스에 추가된다.

<br>

## 관련 코드

| 파일 | 역할 |
| --- | --- |
| `src/modules/link/analysis/link-analysis.type.ts` | 작업 단위·실패 분류·메시지 포맷 정의 |
| `src/modules/link/analysis/link-analysis.service.ts` | 작업 실행. 인라인과 재시도가 공유 |
| `src/modules/link/analysis/link-analysis.dispatcher.ts` | 인라인 실행과 재시도 예약 조율 |
| `src/modules/link/analysis/link-analysis.failure.ts` | RETRYABLE·PERMANENT 분류 |
| `src/modules/ai/ai.exception.ts` | `AiGenerationError.retryable` — AI 실패의 재시도 가능 여부 |
| `src/modules/link/analysis/link-analysis.publisher.ts` | 재시도 메시지 발행 |
| `src/modules/link/analysis/link-analysis.consumer.ts` | 큐 polling과 재시도 처리 |
| `src/infrastructure/sqs/sqs.service.ts` | `SQSClient` 래퍼 |
| `src/config/environment.ts` | `SQS_*` 환경변수 검증 |
| `infra/lib/queue-stack.ts` | 큐·DLQ·런타임 IAM 사용자 정의(CDK) |
| `.github/workflows/deploy-lightsail.yml` | production 배포에 큐 환경변수 주입 |
