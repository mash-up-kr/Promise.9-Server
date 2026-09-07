# 링크 분석 SQS 워커 운영

구조와 테이블 책임은 [최소 설계](./sqs-worker-minimal-design.md)를 참고한다. 링크 저장은 Link·Job·Outbox를 함께 커밋하며, 최초 분석부터 SQS Consumer가 수행한다.

## 실행

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

## 서버 ↔ 별도 워커 전환

1. 기존 Consumer를 끄고 정상 종료를 기다린다. API에서는 `SQS_CONSUMER_ENABLED=false`로 재시작하면 Publisher와 API만 유지된다.
2. 대상 워커를 같은 DB·큐 설정과 `SQS_CONSUMER_ENABLED=true`로 실행한다.
3. 진행 중이던 작업이 강제로 중단됐다면 visibility와 lease 만료 후 재실행된다.

두 Consumer를 동시에 켜면 경쟁 소비한다. PC 우선순위나 자동 서버 대체는 없다. PC가 꺼지면 운영자가 서버 Consumer를 켜야 한다. 큐 보관 기간 내에 재개해야 한다.

GitHub Actions `deploy-lightsail.yml`은 Repository Variable **`SQS_CONSUMER_ENABLED`**를 읽는다. 미설정 시 기존 운영 방식인 true를 유지한다. 별도 워커 사용 시 false로 설정해야 이후 배포가 서버 Consumer를 다시 켜지 않는다. 독립 워커 자동 배포는 이번 범위에 포함하지 않는다.

종료 시 Consumer는 새 수신을 중단하고 최대 180초인 현재 실행을 정리한다. DB·SQS는 그 후 닫는다. `docker-compose.prod.yml`의 API 종료 유예는 4분이다. 독립 워커의 프로세스 관리자에도 동등한 종료 유예를 설정한다. DB 장애 등으로 종료가 지연돼 강제 종료되면 재전달로 복구한다.

## 최초 배포 전환

v2의 `linkId/tasks/attempt`와 v3의 `jobId` 메시지는 호환되지 않는다. 새 Consumer는 v2를 삭제하지 않으며, 재전달 후 DLQ로 이동한다. v2 메시지를 새 코드에 그대로 redrive하지 않는다.

배포 전 다음 순서를 지킨다.

1. 기존 링크 저장·메모 수정 유입을 잠시 중단하고 기존 인라인 실행 및 v2 재시도 큐를 정리한다. DLQ의 v2도 별도로 확인한다. 큐를 무조건 purge하지 않는다.
2. 마이그레이션 `0013`, `0014`를 적용한다. 기존 링크 결과는 변경하지 않는다.
3. CDK diff를 확인하고 `Promise9QueueStack`의 maxReceiveCount=10과 `sqs:ChangeMessageVisibility` 권한을 적용한다.
4. v3 API·Publisher와 선택한 Consumer를 배포하고 저장 → Outbox → SQS → Job 종료를 확인한 뒤 유입을 재개한다.

유입 중단이 불가능하면 별도 v3 큐로 분리하는 배포 계획이 필요하다. 이 문서만으로 그 운영 변경을 실행하지 않는다. 기존 `PENDING` 링크의 일괄 재분석·상태 변경도 자동 수행하지 않는다. 새 코드 롤백 시에는 v3 메시지를 기존 v2 Consumer에 노출하지 않도록 생산·소비 경로를 함께 정리해야 한다.

## 실패와 복구

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

실행은 총 4회이며 일시 실패 간격은 60/120/240초다. 재시도는 해당 Job 전체 실행이다. SQS `ApproximateReceiveCount`는 실제 실행 횟수와 다르다. 요약 성공 후 임베딩 실패라면 Job은 FAILED여도 API의 요약 상태는 SUCCESS일 수 있다.

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

## 큐와 권한

`infra/lib/queue-stack.ts`가 Standard 큐 `promise9-link-analysis`와 `promise9-link-analysis-dlq`를 정의한다. 큐 보관 4일, DLQ 14일, visibility 300초, long polling 20초, maxReceiveCount 10이다. 저장은 SQS 관리형 키로 암호화하고 HTTPS를 강제한다. 메시지에는 Job ID만 담는다.

런타임은 해당 큐에 SendMessage·ReceiveMessage·DeleteMessage·ChangeMessageVisibility 권한을 사용한다. 키 관리 기준은 [런타임 권한 문서](../infrastructure/access.md)를 따른다. DLQ redrive 같은 운영 권한을 런타임에 추가하지 않는다.

## 검증

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
