# 링크 분석 Job · Outbox · SQS 워커 — 구현 및 운영 정리

기준일: 2026-09-08. 이 문서는 현재 구현, 합의한 설계, 검증 결과, 운영 전환과 이후 작업을 함께 정리한 기준 문서다.

## 1. 현재 어디까지 완료됐는가

**링크 분석을 SQS 워커로 처리하고, 나중에 수집기 또는 실행기를 교체할 기반을 구현했다.** 로컬 PostgreSQL·LocalStack으로 장애 복구까지 검증했다. 커밋은 완료했으며 푸시·운영 DB 마이그레이션·AWS 인프라 변경·배포는 실행하지 않았다.

| 항목 | 현재 상태 |
| --- | --- |
| 링크 변경과 Job·Outbox의 트랜잭션 저장 | 구현·검증 완료 |
| 최초 실행과 재시도를 SQS로 전달 | 구현·검증 완료 |
| 중복 메시지·실행 중단·DB 저장 실패 처리 | 구현·검증 완료 |
| 서버와 독립 프로세스에서 같은 워커 실행 | 구현 완료, 독립 워커 시작·종료 검증 완료 |
| 기존 응답 필드와 요약 상태 의미 유지 | 반영 완료 |
| 서버 ↔ 별도 워커 수동 전환 | 기존 환경변수로 제어하도록 구현 |
| 운영 AWS·실제 수집·AI를 포함한 통합 확인 | 운영 적용 전 남은 작업 |
| PC 로컬 브라우저 수집기 | 미구현. 교체 계약만 준비 |
| PC 자동 우선순위·서버 자동 대체 | 이번 범위에서 제외 |

이번 변경의 목적은 처리 요청 유실을 줄이고 장애 후 재실행할 수 있게 만드는 것이다. 가져오지 못하던 사이트의 본문을 더 잘 수집하는 기능은 아직 추가하지 않았다. 기존 수집 성공률 문제가 해결됐다는 의미는 아니다.

## 2. 바꾼 이유와 핵심 결정

기존에는 저장 이후 API 프로세스에서 인라인 분석하고 실패한 단계만 SQS로 재시도했다. 지금은 최초 요청부터 Job·Outbox에 기록하고 같은 Consumer가 처리한다.

| 구성 | 맡는 일 | 필요한 이유 |
| --- | --- | --- |
| Outbox | DB 변경과 큐 전달 요청을 함께 기록 | 링크만 저장되고 분석 요청이 사라지는 틈을 막음 |
| SQS | 워커에 실행 신호를 전달하고 미삭제 메시지를 재전달 | 작업을 API 실행 흐름에서 분리 |
| Job | 작업 상태·실행 횟수·현재 실행 소유권 관리 | SQS 전달 여부와 실제 분석 완료 여부는 다름 |
| 분석 실행기 | 수집·요약·태그·임베딩 결과 생성 | 수집 방식이나 실행 환경을 나중에 교체 |

Outbox만으로 분석 완료를 보장할 수는 없다. 메시지가 전달된 뒤 워커가 멈출 수 있기 때문이다. Job과 실행 토큰으로 결과 저장을 통제하되, 외부 AI 호출이 정확히 한 번만 발생하는 것까지 보장하지는 않는다.

합의한 최소 범위는 다음과 같다.

- 실패 단계만 이어서 실행하지 않고 **해당 Job 전체를 재실행**한다.
- 요약·태그·임베딩도 같은 워커가 수행한다. 단계 사이에 별도 분석용 SQS를 추가하지 않는다.
- PC를 사용할 때는 서버 Consumer를 수동으로 끈다. 워커 등록·접속 신호·자동 우선순위는 두지 않는다.
- 기존 API 응답과 결과 컬럼은 유지한다. 검수 상태·본문 보관·단계 이력은 추가하지 않는다.

## 3. 처리 흐름

```text
API: 링크 저장 또는 메모 수정
  └─ 하나의 DB transaction: Link 변경 + Job + Outbox
      └─ 저장 응답

API 프로세스의 Outbox Publisher
  └─ 미발행 Outbox → SQS 발행 → published_at 기록

서버 내 Consumer 또는 독립 워커
  └─ 메시지 수신 → Job 선점
      └─ ANALYZE: 수집 → 요약·태그(병렬) → 임베딩
      └─ EMBEDDING: 최신 DB 입력으로 임베딩만 생성
  └─ 실행 토큰 검증 → 결과·Job 상태를 함께 저장 → SQS 메시지 삭제
```

메시지는 `{ "version": 3, "jobId": 123 }`다. URL·사용자·실행 횟수는 메시지에 복제하지 않고 DB에서 읽는다. 독립 워커도 같은 DB·SQS·외부 AI 서비스에 접근해야 한다.

`ANALYZE`는 링크 생성 시, `EMBEDDING`은 기존처럼 메모 수정 시 생성한다. 현재 임베딩 입력은 **제목·태그·요약**이고 메모는 포함되지 않는다. 메모 수정이 임베딩 요청을 만드는 기존 정책은 유지했으며, 입력 정책 재검토는 별도 작업이다.

저장 전 preview API는 기존 수집 서비스를 사용한다. 이번 워커 분리로 preview 요청이 SQS로 이동하지는 않는다.

## 4. 파일별 책임

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

## 5. 테이블과 필드

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

| 컬럼 | 역할 |
| --- | --- |
| `id` | 전달 이벤트 식별자 |
| `job_id` | 전달할 Job. FK이며 Job 물리 삭제 시 CASCADE |
| `available_at` | 발행 가능 시각 |
| `published_at` | 발행 성공 시각. NULL이면 미발행 |
| `created_at` | 생성 시각 |

미발행 `(available_at, id)` 부분 인덱스가 있다.

Outbox는 DB 변경과 **전달 요청의 기록**을 묶는다. 작업 완료·중복 실행 제어는 Job이 맡는다. 재시도 시 Job의 `next_attempt_at`과 Outbox의 `available_at`은 같은 값이다. 별도 Publisher lease·횟수·payload는 없다.

## 6. 중복 실행과 상태 저장

- Publisher는 `FOR UPDATE SKIP LOCKED`로 한 Outbox를 잡고 10초 제한의 SQS 발행 후 완료 시각을 기록한다. 발행 후 DB 커밋이 실패하면 중복 발행될 수 있다.
- 같은 링크의 앞선 PENDING/RUNNING Job이 있으면 후속 Outbox 발행을 보류한다. 순서를 기다리는 것만으로 후속 메시지가 DLQ에 빠지는 것을 줄인다.
- 선점·저장 모두 link → job 순서로 잠근다. 외부 수집·AI 호출 중에는 transaction을 유지하지 않는다.
- 선점 시 횟수 증가, 새 토큰과 lease를 기록한다. 저장 시 RUNNING·토큰 일치·유효 lease를 다시 확인한다.
- 성공은 결과와 COMPLETED를 함께 저장한다. 일시 실패는 중간 결과를 저장하지 않고 PENDING과 재시도 Outbox를 함께 저장한다.
- 최종 실패는 확정 가능한 결과와 FAILED를 함께 저장한다. 요약 성공 후 태그·임베딩 실패라면 기존처럼 요약은 SUCCESS다. 새 결과와 맞지 않는 임베딩은 비운다.
- 삭제된 링크에는 결과를 저장하지 않고 CANCELLED로 종료한다. 토큰을 잃은 실행은 결과·실패·재시도 어느 것도 저장하지 않고 메시지도 삭제하지 않는다.
- 결과가 단계마다 보이던 시점은 최종 확정 시점으로 늦춰진다. 기존 API 필드·상태 값·의미는 유지한다. `processingStatus`는 여전히 요약 상태이며 전체 Job 상태가 아니다.

`links.ai_summary_status`를 Job.status로 대체하지 않았다. 요약은 성공하고 임베딩은 실패할 수 있고, EMBEDDING 단독 Job과 Job이 없는 기존 링크도 있기 때문이다. 내부 Job 정보는 기존 API 응답에 추가하지 않는다.

### 실행 시간과 재시도

- 전체 실행 180초 < Job lease 240초 < SQS visibility 기본 300초. visibility가 240초 이하이면 Consumer 시작을 거부한다.
- 총 4회 실행, 일시 실패 간격 60/120/240초. 강제 종료된 실행도 횟수에 포함한다.
- 강제 종료 후 SQS 재전달과 lease 만료로 재선점한다. 네 번째 실행이 중단돼도 다음 수신에서 FAILED로 확정한다.
- 실행 timeout은 후속 단계를 중단한다. 이미 요청한 외부 AI 호출 자체의 취소·비용 환불까지 보장하지 않으며, 재시도 때 AI 비용이 중복될 수 있다.
- 정상 종료는 새 수신을 중단하고 현재 실행을 기다린다. DB·SQS 연결은 그 후 `onApplicationShutdown`에서 닫는다. 배포 컨테이너 종료 유예는 4분이다.
- SQS 보관 기간은 4일, DLQ는 14일, maxReceiveCount는 10이다. DLQ·보관 기간 만료를 자동 복구하는 로직은 없다. 앞선 Job이 멈추면 같은 링크의 후속 Job도 기다리므로 운영 복구가 필요하다.

## 7. 실행과 수동 워커 전환

```bash
bun run build
# API와 Outbox Publisher. SQS_CONSUMER_ENABLED=true이면 분석도 수행
bun run start:prod
# HTTP 서버 없는 독립 워커. SQS_CONSUMER_ENABLED=true 필수
bun run start:worker
# 개발 시 빌드 없이 독립 워커 실행
bun run start:worker:dev
```

독립 워커에는 DB, SQS, AI 접근 설정만 필요하다. JWT·OAuth·이메일 설정은 요구하지 않는다. `.env` 또는 프로세스 환경변수로 주입한다.

| 설정 | 동작 |
| --- | --- |
| `APP_ENV` / 해당 `DATABASE_URL_*` | production은 `DATABASE_URL_PRODUCTION`, development는 `DATABASE_URL_DEVELOPMENT` |
| `SQS_LINK_ANALYSIS_QUEUE_URL` | API Publisher와 Consumer가 공유할 큐 |
| `SQS_CONSUMER_ENABLED` | API 기본 false, 독립 워커는 true 필수 |
| `AWS_REGION`, AWS 자격 증명 | AWS SDK 기본 credential provider chain 사용 |
| `OPENAI_API_KEY` | production 필수. 실제 임베딩 호출에도 필요 |
| `GEMINI_API_KEY`, `TINY_FISH_API_KEY` | 해당 제공자·수집기를 사용할 때 설정 |
| `SQS_WAIT_TIME_SECONDS` | 기본 20초, 1~20 |
| `SQS_VISIBILITY_TIMEOUT_SECONDS` | 기본 300초. Job lease 240초보다 커야 함 |
| `SQS_ENDPOINT` | 개발용 LocalStack 등 호환 엔드포인트 |

큐 URL이 없으면 API는 저장한 Outbox를 DB에 남겨두고 발행하지 않는다. Consumer는 큐 URL 없이 켤 수 없다. 큐 없이 인라인 분석하던 경로는 제거됐다. 독립 워커에는 Publisher가 없으므로 API 프로세스가 Outbox를 계속 발행해야 한다.

development에서 production 큐 `promise9-link-analysis`에 직접 발행·소비하는 것을 차단한다. 로컬 테스트는 별도 DB와 LocalStack을 사용한다. PC에서 운영 작업을 처리하려면 명시적인 production 설정과 운영 접근 권한으로 실행해야 한다.

### 전환 순서

1. 기존 Consumer를 끄고 정상 종료를 기다린다. API에서는 `SQS_CONSUMER_ENABLED=false`로 재시작하면 Publisher와 API만 유지된다.
2. 대상 워커를 같은 DB·큐 설정과 `SQS_CONSUMER_ENABLED=true`로 실행한다.
3. 진행 중이던 작업이 강제로 중단됐다면 visibility와 lease 만료 후 재실행된다.

각 Consumer는 메시지를 하나씩 처리한다. 두 Consumer를 동시에 켜면 경쟁 소비한다. PC 우선순위나 자동 서버 대체는 없다. PC가 꺼지면 운영자가 서버 Consumer를 켜야 한다. 큐 보관 기간 내에 재개해야 한다.

GitHub Actions `deploy-lightsail.yml`은 Repository Variable **`SQS_CONSUMER_ENABLED`**를 읽는다. 미설정 시 기존 운영 방식인 true를 유지한다. 별도 워커 사용 시 false로 설정해야 이후 배포가 서버 Consumer를 다시 켜지 않는다. 독립 워커 자동 배포는 이번 범위에 포함하지 않는다.

종료 시 Consumer는 새 수신을 중단하고 최대 180초인 현재 실행을 정리한다. DB·SQS는 그 후 닫는다. `docker-compose.prod.yml`의 API 종료 유예는 4분이다. 독립 워커의 프로세스 관리자에도 동등한 종료 유예를 설정한다. DB 장애 등으로 종료가 지연돼 강제 종료되면 재전달로 복구한다.

## 8. 장애 대응과 관측

| 상황 | 처리 |
| --- | --- |
| Job·Outbox 삽입 실패 | 링크 변경까지 롤백 |
| SQS 발행 실패 | Outbox 미발행 유지, Publisher 재시도 |
| SQS 발행 후 DB 커밋 실패 | 중복 발행 가능, Job 토큰으로 결과 중복 반영 차단 |
| 일시적 분석 실패 | Job PENDING과 재시도 Outbox를 함께 저장 후 현재 메시지 삭제 |
| 결과·재시도 저장 실패 | 메시지 미삭제, 재전달 |
| 저장 성공 후 메시지 삭제 실패 | 다음 수신에서 종료 Job 확인 후 외부 호출 없이 삭제 |
| 실행 도중 종료 | lease·visibility 만료 후 재선점 |
| 최종 실패 | Job FAILED. 확정 가능한 결과와 기존 의미의 요약 상태 저장 |
| 메시지 파싱 실패·장기 DB 장애 | 미삭제로 재전달, 수신 횟수 초과 시 DLQ |

미발행 Outbox와 지연된 Job을 확인한다.

```sql
select count(*), min(available_at) as oldest_available_at
from link_analysis_outbox
where published_at is null and available_at <= now();

select id, link_id, job_type, status, attempt_count,
       next_attempt_at, lease_expires_at, last_error_code
from link_processing_jobs
where (status = 'RUNNING' and lease_expires_at < now())
   or (status = 'PENDING' and next_attempt_at < now() - interval '1 hour')
   or status = 'FAILED'
order by id;
```

DLQ가 증가하면 먼저 파싱·권한·DB 장애의 원인을 수정한다. v3 메시지이고 Job이 아직 활성 상태라면 운영자 권한으로 원래 큐에 redrive한다. 종료된 Job은 재실행되지 않는다. 앞선 Job이 DLQ에 머물면 같은 링크의 후속 Outbox도 기다린다.

SQS 보관 기간 만료 등으로 메시지가 사라진 활성 Job은 아래 조건을 확인한 뒤 **해당 Job 하나만** 다시 발행 예약할 수 있다. 이때 중복 메시지가 남아 있어도 선점·토큰 검증을 거친다. 이 SQL은 자동 배치가 아니며 운영자가 대상을 검토해 실행한다.

```sql
-- :job_id는 확인한 대상 ID로 바꾼다. 실행 중이거나 재시도 시각 전인 Job은 대상에서 제외한다.
insert into link_analysis_outbox (job_id)
select id from link_processing_jobs
where id = :job_id
  and next_attempt_at <= now()
  and (status = 'PENDING'
       or (status = 'RUNNING' and lease_expires_at < now()));
```

FAILED 재분석은 별도 명시적 요청의 영역이며 이 복구 SQL로 되살리지 않는다. DLQ 알림·자동 복구기는 이번에 추가하지 않았다. 운영에서는 큐의 적체·DLQ·DB 지연을 함께 관측해야 한다.

## 9. 운영 적용 전 해야 할 일

v2의 `linkId/tasks/attempt`와 v3의 `jobId` 메시지는 호환되지 않는다. 새 Consumer는 v2를 삭제하지 않으며, 재전달 후 DLQ로 이동한다. v2 메시지를 새 코드에 그대로 redrive하지 않는다.

배포 전 다음 순서를 지킨다.

1. 기존 링크 저장·메모 수정 유입을 잠시 중단하고 기존 인라인 실행 및 v2 재시도 큐를 정리한다. DLQ의 v2도 별도로 확인한다. 큐를 무조건 purge하지 않는다.
2. 마이그레이션 `0013`, `0014`를 적용한다. 기존 링크 결과는 변경하지 않는다.
3. CDK diff를 확인하고 `Promise9QueueStack`의 maxReceiveCount=10과 `sqs:ChangeMessageVisibility` 권한을 적용한다.
4. v3 API·Publisher와 선택한 Consumer를 배포하고 저장 → Outbox → SQS → Job 종료를 확인한 뒤 유입을 재개한다.

유입 중단이 불가능하면 별도 v3 큐로 분리하는 배포 계획이 필요하다. 이 문서만으로 그 운영 변경을 실행하지 않는다. 기존 `PENDING` 링크의 일괄 재분석·상태 변경도 자동 수행하지 않는다. 새 코드 롤백 시에는 v3 메시지를 기존 v2 Consumer에 노출하지 않도록 생산·소비 경로를 함께 정리해야 한다.

### 큐와 권한

`infra/lib/queue-stack.ts`가 Standard 큐 `promise9-link-analysis`와 `promise9-link-analysis-dlq`를 정의한다. 큐 보관 4일, DLQ 14일, visibility 300초, long polling 20초, maxReceiveCount 10이다. 저장은 SQS 관리형 키로 암호화하고 HTTPS를 강제한다. 메시지에는 Job ID만 담는다.

런타임은 해당 큐에 SendMessage·ReceiveMessage·DeleteMessage·ChangeMessageVisibility 권한을 사용한다. 키 관리 기준은 [런타임 권한 문서](../infrastructure/access.md)를 따른다. DLQ redrive 같은 운영 권한을 런타임에 추가하지 않는다.

## 10. 검증 결과와 재현

| 검증 | 결과와 범위 |
| --- | --- |
| TypeScript 빌드·인프라 타입 검사 | 통과 |
| Jest | 48개 suite, 304개 테스트 통과 |
| 커밋 훅 | Bun 테스트 306개 통과. Jest와 탐색 범위가 달라 개수가 다름 |
| PostgreSQL 통합 | 마이그레이션·롤백·동시 선점·토큰 검증·삭제/복구 등 12개 검증 통과 |
| PostgreSQL + LocalStack | 정상 처리·중복 정리·재시도·저장 실패·중단 복구·DLQ 검증 통과 |
| 독립 워커 시작·종료 | 최소 환경변수, 실제 PostgreSQL, 로컬 SQS 응답 서버로 검증 |


```bash
bun run build
bun run test -- --runInBand
bun run infra:typecheck
# 삭제 가능한 로컬 전용 DB promise9_job_test 필요. 링크 테스트 데이터를 초기화한다.
LINK_JOB_TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/promise9_job_test bun run test:jobs:integration
```

통합 스크립트는 loopback의 `promise9_job_test`만 허용한다. 마이그레이션, Outbox 실패 롤백, 동시 발행·선점, 토큰 소유권 상실, 재시도·횟수 소진, 후속 Job 순서, 링크 삭제·복구를 실제 PostgreSQL에서 검증한다. LocalStack을 통한 SQS 통합 검증도 제공한다. 로컬 재현에는 [공식 배포된 Community 4.14.0 이미지](https://blog.localstack.cloud/localstack-for-aws-release-v-4-14-0/)를 사용했다.

```bash
docker run -d --rm --name promise9-job-sqs-test \
  -p 127.0.0.1:45689:4566 \
  -e SERVICES=sqs -e SQS_ENDPOINT_STRATEGY=dynamic \
  localstack/localstack:4.14.0

LINK_JOB_TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/promise9_job_test \
LINK_JOB_TEST_SQS_ENDPOINT=http://127.0.0.1:45689 \
bun run test:jobs:sqs

docker stop promise9-job-sqs-test
```

SQS 검증도 전용 테스트 DB의 링크 데이터를 초기화한다. 실행마다 별도 큐·DLQ를 생성하고 종료 시 삭제한다. Publisher·Consumer·Repository·SQS SDK는 실제 코드를 사용하고, 수집·AI 실행만 고정된 테스트 결과로 대체한다. 검증 프로세스의 AWS 자격 증명은 로컬 테스트 값으로 고정한다.

검증 범위는 정상 저장·ACK, 완료 메시지 중복 정리, 재시도 Outbox, 결과 저장 실패의 원자적 롤백·ACK 보류, 실행 중단 후 재전달, 파싱 실패 메시지의 DLQ 이동이다. 예약 시간과 lease는 테스트 DB에서 앞당기고 visibility는 테스트 큐 API로 해제하므로 실제 60/240/300초를 기다리는 검증은 아니다. DLQ 테스트의 maxReceiveCount는 3으로 단축하며 운영 설정 10은 변경하지 않는다.

2026-09-08 실제 PostgreSQL과 LocalStack에서 위 경로를 검증했다. 운영 AWS IAM·네트워크 및 실제 수집·AI를 포함한 검증은 배포 전 별도 테스트 큐에서 수행한다.

## 11. 이후 PC 브라우저 수집기 연결

다음 기능 구현 대상은 `ContentCollector.collect(url)` 계약을 만족하는 PC 브라우저 수집기다. `LinkAnalysisModule`에서 `LINK_CONTENT_COLLECTOR` provider를 바꾸면, 공통 요약·태그·임베딩과 Job·Outbox·SQS 처리를 재사용할 수 있다. 전체 분석 실행기를 바꿀 때는 `LINK_ANALYSIS_EXECUTOR` 계약을 사용한다.

아직 브라우저 실행·프로필·로그인 세션·사이트별 수집 방식은 정하지 않았다. 실제 구현 시 결정할 내용이다. 비공개 저장소나 공통 패키지 분리도 아직 수행하지 않았다. 현재 provider 교체 지점이 있다는 것이 임의의 외부 워커 플러그인을 즉시 로드할 수 있다는 뜻은 아니다.

PC에서 운영 Job을 처리할 경우 데이터·자격 증명 접근 범위도 함께 정해야 한다. PC가 종료되면 자동으로 서버가 처리하도록 만드는 기능은 이번 합의에 없으며, 현재는 운영자가 서버 Consumer를 켜야 한다.

운영 적용 시에는 v2 → v3 큐 전환과 실제 AWS·수집·AI 검증을 먼저 완료한다. 이후 PC 수집기를 붙여 같은 Job 계약으로 동작하는지 확인한다. 기존에 남아 있는 미처리 링크의 재분석 범위와 FAILED 재실행 방법은 별도로 정한다.

## 12. 구현 커밋

| 커밋 | 내용 |
| --- | --- |
| `6eb9748` | 링크 분석 Job·Outbox 스키마 추가 |
| `f63e716` | Outbox·Job 기반 최초 분석·재시도 전환, 책임 분리, 미사용 worker_id 제거 |
| `ed28572` | 독립 워커 실행·수동 전환 설정·운영 문서 |
| `638d314` | LocalStack 기반 전달·장애 복구 검증 |

위 변경은 로컬 커밋 상태다. 이 문서 정리는 운영 적용을 수행하지 않는다.
