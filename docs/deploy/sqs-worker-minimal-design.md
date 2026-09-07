# 링크 분석 Job · Outbox · SQS 설계

갱신일: 2026-09-08. 최초 분석과 재시도를 SQS로 전달하고, 워커는 수동 전환한다. 기존 API 응답 필드와 요약 상태의 의미를 유지한다.

## 처리 흐름

```text
API: Link 변경 + Job + Outbox를 하나의 DB transaction으로 저장
  → API 프로세스의 Publisher가 Outbox를 SQS에 전달
  → Consumer가 Job 선점
  → 수집 → 요약·태그 → 임베딩
  → 실행 토큰 검증 후 결과와 Job 상태를 하나의 transaction으로 저장
  → SQS 메시지 삭제
```

- `ANALYZE`: 수집부터 임베딩까지 실행한다. 중간 장애 시 전체를 다시 실행한다.
- `EMBEDDING`: 현재 메모 수정 시 임베딩만 요청하는 경로를 유지한다. 현재 임베딩 입력은 제목·태그·요약이며 메모는 포함되지 않는다. 이 정책은 이번 변경 대상이 아니다.
- 서버 내 Consumer와 별도 프로세스는 같은 실행 모듈을 사용한다. 한 프로세스는 메시지를 하나씩 처리한다.
- 수집 방식, 프롬프트, 모델, preview API의 정책은 유지한다. PC 브라우저 수집기, 자동 우선순위·대체, heartbeat, 본문 보관, 검수 기능은 추가하지 않는다.

## 파일별 책임

경로는 `src/modules/link/` 기준이다.

| 파일 | 책임 |
| --- | --- |
| `link.service.ts` | 요청 검증·권한 확인·기존 응답 조립 |
| `link.repository.ts` | 링크 조회·변경. 생성과 메모 수정 transaction에서 Job·Outbox도 생성 |
| `analysis/link-job.schema.ts` | Job·Outbox 테이블과 DB 제약. 워커 실행 코드는 없음 |
| `analysis/link-job.repository.ts` | Job 생성, 선점, 재시도 예약, 실행 토큰 검증, 결과·종료 상태의 원자적 저장 |
| `analysis/link-outbox.repository.ts` | 발행할 Outbox 잠금과 발행 완료 저장 |
| `analysis/link-analysis.publisher.ts` | Outbox 폴링과 SQS 발행. API 프로세스에만 등록 |
| `analysis/link-analysis.consumer.ts` | SQS 수신, 실행 제한 시간, Job 처리 호출, 저장 성공 후 메시지 삭제 |
| `analysis/link-analysis.service.ts` | 수집·AI 결과 생성. 링크·태그를 DB에 직접 저장하지 않음 |
| `analysis/link-analysis.type.ts` | 실행기의 입력·결과 계약과 주입 토큰 |
| `analysis/link-job.type.ts` | 선점된 Job·링크·태그 입력 |
| `analysis/link-job.constant.ts` | 실행 횟수·제한 시간·선점 만료 시간 |
| `analysis/link-analysis.module.ts` | Consumer·실행기·수집기의 Nest provider 조립 |
| `content/link-content.module.ts` | 기존 수집 서비스와 HTML·TinyFish 의존성 조립 |
| `content/link-content.type.ts` | 수집 결과와 교체 가능한 수집기 계약 |

`src/worker.module.ts`와 `src/worker.ts`는 HTTP 서버 없이 분석 모듈만 실행한다. `src/infrastructure/sqs/`는 SDK 호출만 담당하며 Job 상태나 분석 정책을 모른다.

기존 Dispatcher, 단계별 재시도 메시지, 분석 서비스의 직접 저장, 미사용 `updateActive`·`findAnalysisMetadata`·`replaceAiTags`는 제거했다. 별도 Result Writer나 Collector Adapter는 만들지 않았다. 기존 수집 서비스가 계약을 만족하므로 `useExisting`으로 연결한다.

## 스키마 검토 결과

`links`와 `tags`의 컬럼 변경은 없다. 새 테이블은 두 개다.

### link_processing_jobs

한 행은 하나의 논리 작업이며 재시도는 같은 행을 사용한다.

| 컬럼 | 이유 |
| --- | --- |
| `id` | SQS가 전달하는 Job 식별자 |
| `link_id`, `user_id` | 대상·소유자. 기존 `links(id, user_id)`와 복합 FK로 소유자 불일치 방지 |
| `job_type` | ANALYZE / EMBEDDING |
| `status` | PENDING / RUNNING / COMPLETED / FAILED / CANCELLED |
| `attempt_count` | 실제 선점 횟수. 대기·중복 수신을 포함하는 SQS 수신 횟수와 구분 |
| `next_attempt_at` | 오래된 메시지가 재시도 예약 시각 전에 실행되는 것을 차단 |
| `execution_token` | 재선점 후 이전 실행의 결과 저장 차단 |
| `lease_expires_at` | 프로세스 강제 종료 후 재선점 가능 시점 |
| `last_error_code`, `last_error_message` | 마지막 실패의 분류·고정된 설명. 외부 오류 원문은 저장하지 않음 |
| `created_at`, `updated_at`, `finished_at` | 요청·상태 변경·종료 관측 |

`worker_id`는 실제 제어·복구에서 사용하지 않아 제거했다. 워커 등록 테이블도 없다. 실행 토큰은 워커의 신원이 아니라 해당 실행의 소유권이다.

- Job 종류·상태·음수가 아닌 횟수 CHECK, 링크 삭제 시 CASCADE.
- `(link_id, id)` 활성 작업 부분 인덱스: 같은 링크의 앞선 작업 확인.
- `link_id` RUNNING 부분 UNIQUE: 링크당 한 실행만 허용.
- `lease_expires_at` RUNNING 부분 인덱스: 만료 작업 관측.
- `0013`은 테이블 생성, `0014`는 리뷰에서 제거한 `worker_id` 반영이다. 기존 링크 데이터는 변경하지 않는다.

### link_analysis_outbox

`id`, `job_id`, `available_at`, `published_at`, `created_at`만 둔다. 미발행 `(available_at, id)` 부분 인덱스가 있다.

Outbox는 DB 변경과 **전달 요청의 기록**을 묶는다. 작업 완료·중복 실행 제어는 Job이 맡는다. 재시도 시 Job의 `next_attempt_at`과 Outbox의 `available_at`은 같은 값이다. 별도 Publisher lease·횟수·payload는 없다.

## 동시 실행과 결과 저장

- 메시지는 `{ "version": 3, "jobId": 123 }`다. URL·소유자·횟수는 DB에서 읽는다.
- Publisher는 `FOR UPDATE SKIP LOCKED`로 한 Outbox를 잡고 10초 제한의 SQS 발행 후 완료 시각을 기록한다. 발행 후 DB 커밋이 실패하면 중복 발행될 수 있다.
- 같은 링크의 앞선 PENDING/RUNNING Job이 있으면 후속 Outbox 발행을 보류한다. 순서를 기다리는 것만으로 후속 메시지가 DLQ에 빠지는 것을 줄인다.
- 선점·저장 모두 link → job 순서로 잠근다. 외부 수집·AI 호출 중에는 transaction을 유지하지 않는다.
- 선점 시 횟수 증가, 새 토큰과 lease를 기록한다. 저장 시 RUNNING·토큰 일치·유효 lease를 다시 확인한다.
- 성공은 결과와 COMPLETED를 함께 저장한다. 일시 실패는 중간 결과를 저장하지 않고 PENDING과 재시도 Outbox를 함께 저장한다.
- 최종 실패는 확정 가능한 결과와 FAILED를 함께 저장한다. 요약 성공 후 태그·임베딩 실패라면 기존처럼 요약은 SUCCESS다. 새 결과와 맞지 않는 임베딩은 비운다.
- 삭제된 링크에는 결과를 저장하지 않고 CANCELLED로 종료한다. 토큰을 잃은 실행은 결과·실패·재시도 어느 것도 저장하지 않고 메시지도 삭제하지 않는다.
- 결과가 단계마다 보이던 시점은 최종 확정 시점으로 늦춰진다. 기존 API 필드·상태 값·의미는 유지한다. `processingStatus`는 여전히 요약 상태이며 전체 Job 상태가 아니다.

## 제한 시간과 복구 범위

- 전체 실행 180초 < Job lease 240초 < SQS visibility 기본 300초. visibility가 240초 이하이면 Consumer 시작을 거부한다.
- 총 4회 실행, 일시 실패 간격 60/120/240초. 강제 종료된 실행도 횟수에 포함한다.
- 강제 종료 후 SQS 재전달과 lease 만료로 재선점한다. 네 번째 실행이 중단돼도 다음 수신에서 FAILED로 확정한다.
- 실행 timeout은 후속 단계를 중단한다. 이미 요청한 외부 AI 호출 자체의 취소·비용 환불까지 보장하지 않으며, 재시도 때 AI 비용이 중복될 수 있다.
- 정상 종료는 새 수신을 중단하고 현재 실행을 기다린다. DB·SQS 연결은 그 후 `onApplicationShutdown`에서 닫는다. 배포 컨테이너 종료 유예는 4분이다.
- SQS 보관 기간은 4일, DLQ는 14일, maxReceiveCount는 10이다. DLQ·보관 기간 만료를 자동 복구하는 로직은 없다. 앞선 Job이 멈추면 같은 링크의 후속 Job도 기다리므로 운영 복구가 필요하다.

## 워커 교체

API Consumer를 끄고 독립 워커를 켜는 데 기존 `SQS_CONSUMER_ENABLED`만 사용한다. 환경변수 변경 후 프로세스 재시작이 필요하다. 양쪽을 켜면 경쟁 소비하며 PC 우선순위는 보장하지 않는다. PC가 꺼져도 서버를 자동으로 켜지 않는다.

나중에 `LINK_CONTENT_COLLECTOR` provider를 브라우저 구현으로 바꾸면 공통 AI·Job·SQS 흐름은 유지할 수 있다. 전체 실행기를 바꿀 때는 `LINK_ANALYSIS_EXECUTOR` 계약을 사용한다. 비공개 패키지 분리는 실제 브라우저 구현 시 결정한다.

실행·배포 전환·복구 절차는 [운영 문서](./sqs-link-analysis.md)를 따른다.


## 검증 보완 (2026-09-08)

실제 PostgreSQL과 LocalStack에서 Outbox → SQS → Consumer → 결과 저장·ACK를 검증했다. 완료된 Job의 중복 정리, 재시도, 저장 실패 롤백과 ACK 보류, 중단 후 재전달, DLQ 이동도 통과했다. 수집·AI는 테스트 실행기로 대체했으며 운영 자격 증명은 사용하지 않았다. 실행 명령은 운영 문서의 `test:jobs:sqs`를 참고한다.
