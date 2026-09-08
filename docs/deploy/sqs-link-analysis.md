# 링크 분석 워커 설계 및 운영

기준일: 2026-09-08

**사용자가 링크를 저장하면, 분석할 일을 DB에 남기고 SQS를 통해 워커에게 전달한다. 워커는 수집·요약·태그·임베딩을 수행하고 결과를 저장한다.**

이 기반은 구현과 로컬 장애 복구 검증까지 완료했다. PC 브라우저 수집기와 운영 배포는 아직 남아 있다.

## 목차

1. [배경](#1-배경)
2. [핵심 개념과 도입 이유](#2-핵심-개념과-도입-이유)
3. [링크 처리 흐름](#3-링크-처리-흐름)
4. [장애 복구와 중복 실행 제어](#4-장애-복구와-중복-실행-제어)
5. [PC 워커 연결 구조](#5-pc-워커-연결-구조)
6. [코드 구조와 데이터 모델](#6-코드-구조와-데이터-모델)
7. [실행 설정과 워커 전환](#7-실행-설정과-워커-전환)
8. [운영 절차](#8-운영-절차)
9. [검증 결과와 재현 방법](#9-검증-결과와-재현-방법)
10. [구현 현황과 후속 작업](#10-구현-현황과-후속-작업)

## 1. 배경

링크를 저장하는 일과 링크를 분석하는 일은 걸리는 시간과 실패 원인이 다르다. 저장은 DB 변경이지만, 분석은 외부 사이트와 AI 응답을 기다려야 한다. 사이트가 응답하지 않거나 분석 중 프로세스가 종료될 수도 있다.

기존에는 링크 저장 후 API 프로세스가 인라인으로 분석하고, 실패한 단계만 SQS로 재시도했다. 지금은 최초 요청부터 기록해 두고 워커가 처리한다.

| 해결하려는 문제 | 이번에 적용한 방법 |
| --- | --- |
| 링크는 저장됐는데 분석 요청 전달에 실패한다 | 링크와 Outbox를 같은 DB 트랜잭션으로 저장 |
| 분석하다가 프로세스가 종료된다 | SQS 재전달과 Job의 실행 만료 시간으로 복구 |
| 같은 요청이 다시 도착하거나 이전 실행이 늦게 끝난다 | Job 상태와 실행 토큰을 확인한 뒤 결과 반영 |
| 나중에 다른 머신이나 PC 브라우저로 수집하고 싶다 | 워커 실행과 수집기 구현을 교체할 수 있도록 분리 |

**이번 작업은 분석 요청을 전달하고 복구하는 기반을 만든 것이다.** 기존 수집기를 유지했으므로, 가져오지 못하던 사이트의 본문 수집 문제가 해결된 것은 아니다.

## 2. 핵심 개념과 도입 이유

먼저 네 가지를 구분하면 전체 흐름을 이해하기 쉽다.

| 구성 | 쉽게 말하면 | 우리 프로젝트에서의 형태 |
| --- | --- | --- |
| **Worker** | 실제로 일을 수행하는 프로그램 | 메시지를 받고 수집·AI 분석을 실행하는 코드 |
| **SQS** | 처리 요청을 전달하는 대기열 | AWS의 메시지 큐 |
| **Job** | 무엇을 해야 하고 어디까지 처리됐는지 남기는 작업 기록 | PostgreSQL의 `link_processing_jobs` 테이블 |
| **Outbox** | 큐로 보내야 할 요청을 먼저 적어 두는 발송 기록 | PostgreSQL의 `link_analysis_outbox` 테이블 |

### Worker — 작업 실행 프로그램

워커는 DB 행이나 별도의 AWS 상품이 아니다. 대기 중인 요청을 가져와 실제 처리를 수행하는 프로그램이다. 현재 워커는 **수집 → 요약·태그 → 임베딩**을 담당한다.

워커 안에서도 역할이 나뉜다. **Consumer**는 SQS 메시지를 받는 부분이고, **분석 실행기**는 수집·AI 작업을 하는 부분이다. Consumer가 분석 실행기를 호출한다.

같은 워커 코드를 API와 한 프로세스에서 실행할 수도 있고, HTTP 서버 없는 독립 프로세스로 실행할 수도 있다. 이 때문에 나중에 서버와 별도로 PC에서 실행할 수 있다.

### SQS — 작업 전달 큐

API가 워커를 직접 호출하지 않고 SQS에 메시지를 남긴다. 워커는 큐에서 메시지를 받아 일을 시작한다. 워커가 잠시 없어도 메시지는 큐의 보관 기간 동안 기다릴 수 있다.

우리 메시지는 다음처럼 작다.

```json
{ "version": 3, "jobId": 123 }
```

이는 “123번 Job을 확인하고 처리하라”는 신호다. URL·사용자·분석 결과는 DB에 있고, SQS에 복사하지 않는다.

SQS가 본문을 수집하거나 AI를 실행하는 것은 아니다. 또 같은 메시지가 다시 전달될 수 있으므로, **메시지를 받았다고 무조건 분석을 시작하지 않고 Job을 확인한다.**

### Job — 작업 상태 기록

예를 들어 “17번 링크를 분석한다”는 요청이 Job 123이다. Job은 대상 링크, 작업 종류, 상태, 실행 횟수, 현재 실행의 유효 시간을 기록한다.

| Job 상태 | 의미 |
| --- | --- |
| `PENDING` | 최초 실행 또는 재시도를 기다림 |
| `RUNNING` | 워커가 처리할 권한을 얻어 실행 중 |
| `COMPLETED` | 작업 성공과 결과 저장이 완료됨 |
| `FAILED` | 재시도할 수 없거나 실행 횟수를 소진해 종료됨 |
| `CANCELLED` | 대상 링크 삭제 등으로 처리를 취소함 |

**Job과 Worker는 다르다.** 워커가 종료돼도 Job 기록은 DB에 남는다. 다른 워커가 같은 Job을 이어받아 다시 실행할 수 있다.

AI를 사용한다고 반드시 Job 테이블이 필요한 것은 아니다. 우리 구조에서는 긴 외부 호출의 실패·재시도, 중복 요청, 오래된 실행의 결과 저장을 관리하기 위해 둔다. 요약과 임베딩을 단계별로 복구하기 위한 테이블은 아니다. 현재 재시도는 해당 Job 전체를 다시 실행한다.

### Outbox — 발행 요청 기록

링크를 DB에 저장한 뒤 SQS에 바로 보내기만 하면 다음 상황이 생길 수 있다.

```text
링크 저장 성공 → 프로세스 종료 또는 SQS 오류 → 분석 요청이 전달되지 않음
```

DB 저장과 SQS 전송은 서로 다른 시스템의 작업이다. DB 트랜잭션만으로 두 작업을 함께 성공·실패하게 만들 수는 없다.

그래서 먼저 **링크 + Job + Outbox를 같은 DB 트랜잭션으로 저장**한다. 여기서 트랜잭션은 셋을 모두 저장하거나, 하나라도 실패하면 셋 모두 저장하지 않는다는 뜻이다.

이후 **Publisher**가 Outbox를 읽어 SQS에 보낸다. Publisher는 발송 담당 프로그램이며, Outbox 테이블 자체가 전송을 수행하지는 않는다. 전송이 실패하면 미발행 기록이 남아 다음에 다시 보낼 수 있다.

### Outbox와 Job의 역할 분담

두 기록이 답하는 질문이 다르다.

| 확인할 질문 | 확인할 곳 |
| --- | --- |
| “이 요청을 SQS에 보냈는가?” | Outbox의 `published_at` |
| “실제 분석이 완료됐는가?” | Job의 `status` |

Outbox가 발행 완료여도 워커는 아직 분석 중일 수 있다. 따라서 Outbox만으로 분석 완료를 판단할 수 없다. 반대로 Job만 만들어 놓고 큐 전달에 실패하면, 그 Job을 워커에게 알리는 별도 방법이 필요하다. 우리는 그 전달 기록을 Outbox로 관리한다.

## 3. 링크 처리 흐름

사용자가 **17번 링크**를 저장하고, **123번 Job**이 생성되는 예로 보자. 숫자는 설명을 위한 예시다.

```text
① API: Link 17 + Job 123 + Outbox를 함께 저장 → 사용자에게 저장 응답
② Publisher: Outbox를 읽어 SQS에 { jobId: 123 } 발행
③ Worker: 메시지를 받고 Job 123의 실행 권한 확보
④ Worker: 수집 → 요약·태그 → 임베딩
⑤ DB: 분석 결과 + Job COMPLETED를 함께 저장
⑥ Worker: SQS 메시지 삭제
```

### ① 링크 저장과 API 응답

API는 Link·Job·Outbox 저장이 커밋되면 응답한다. 이후 분석이 실패하더라도 사용자가 저장한 링크 자체가 사라지는 것은 아니다.

### ② SQS 메시지 발행

Publisher가 SQS 발행을 확인하면 Outbox의 `published_at`을 기록한다. 이 시점은 워커의 분석 완료 시점이 아니다.

발행은 성공했는데 DB에 발행 완료를 기록하기 전에 종료되면, 같은 요청을 다시 보낼 수 있다. 이 중복을 허용하고 Job 처리 시 안전하게 정리한다.

### ③ Job 선점

메시지를 받은 워커는 Job이 이미 끝났는지, 실행 가능한 시각인지, 다른 실행이 진행 중인지 확인한다. 실행할 수 있으면 `RUNNING`으로 바꾸고 실행 횟수를 늘린다. 이 과정을 **선점**이라고 부른다.

같은 링크에 여러 Job이 있으면 앞선 작업을 먼저 처리한다. 앞선 작업이 끝나기 전에는 후속 Outbox 발행도 보류한다. 다른 링크들은 여러 워커가 병렬로 처리할 수 있다.

### ④ 분석 실행

| 작업 종류 | 생성되는 때 | 실행 내용 |
| --- | --- | --- |
| `ANALYZE` | 링크 생성 | 수집 → 요약·태그 병렬 생성 → 임베딩 |
| `EMBEDDING` | 메모 수정 | 최신 DB 입력으로 임베딩만 생성 |

메모 수정 시 임베딩을 요청하는 기존 동작은 유지했다. 다만 현재 임베딩 입력은 **제목·태그·요약**이며 메모는 포함되지 않는다. 이 입력 정책 재검토는 별도 작업이다.

저장 전 **preview API**도 기존 방식 그대로다. 워커의 수집기를 교체해도 preview API가 자동으로 그 수집기를 사용하는 것은 아니다.

### ⑤ 결과와 Job 상태 저장

분석 실행기는 결과를 반환하고, Job Repository가 실행 권한을 다시 확인한 뒤 링크·태그 결과와 Job 상태를 한 트랜잭션에 저장한다. 수집·AI 호출을 기다리는 동안에는 DB 트랜잭션을 유지하지 않는다.

기존에는 단계마다 저장하던 결과가 이제 해당 실행의 최종 확정 시점에 보인다. 재시도 예정인 일시 실패에서는 중간 결과를 저장하지 않는다. 최종 실패에서는 그 실행에서 확정할 수 있는 결과와 FAILED를 함께 저장하고, 새 결과와 맞지 않는 임베딩은 비운다.

### ⑥ SQS 메시지 삭제

SQS 메시지 삭제는 “이 전달 건은 처리했으니 더 보내지 않아도 된다”는 확인이다. 이를 이 문서에서는 **ACK**라고 부른다.

성공 결과뿐 아니라 재시도 예약이나 최종 실패를 DB에 확정했을 때도 현재 메시지를 삭제한다. DB 저장이 실패했다면 메시지를 남겨 재전달받는다.

## 4. 장애 복구와 중복 실행 제어

### 분석 실패와 재시도

123번 Job의 첫 실행에서 일시적인 AI 오류가 발생했다고 하자.

```text
Job 123 RUNNING, 실행 횟수 1
  → DB에 Job PENDING + 60초 뒤 발행할 새 Outbox를 함께 저장
  → 현재 SQS 메시지 삭제
  → Publisher가 예약 시각 이후 새 메시지 발행
  → Job 123 재선점, 실행 횟수 2
```

**자동 재시도에서 Job 행은 그대로이고 Outbox 행이 새로 생긴다.** 최초 요청과 재시도 모두 같은 큐를 사용한다. 요약·태그·임베딩 사이에 별도 큐는 없다.

`ANALYZE`가 임베딩에서 실패해도 다음 실행은 수집부터 다시 한다. 현재는 중간 결과를 보관하고 실패 단계만 복구하는 복잡성을 줄이기로 했다. 그만큼 성공했던 AI 호출도 반복돼 비용이 중복될 수 있다.

### 워커 종료와 실행 만료

워커가 메시지를 받으면 SQS는 일정 시간 그 메시지가 일반적인 재수신 대상이 되지 않도록 숨긴다. 이 시간이 **visibility timeout**이다. 삭제되지 않은 메시지는 이 시간이 지나면 다시 받을 수 있다. 중복 전달 가능성까지 없애는 잠금은 아니다.

DB에는 별도로 **lease**를 둔다. 이는 “이 실행이 Job을 처리할 권한이 언제까지 유효한가”를 뜻한다. 워커가 갑자기 종료되면 `RUNNING`만 남을 수 있으므로, 만료 후 다른 워커가 다시 선점할 수 있게 한다.

| 시간 | 현재 설정 | 의미 |
| --- | --- | --- |
| 전체 실행 제한 | 180초 | 분석 실행이 너무 길어지면 timeout 처리 |
| Job lease | 240초 | DB가 인정하는 현재 실행 권한의 유효 시간 |
| SQS visibility | 기본 300초 | 메시지를 삭제하지 않았을 때 다시 받을 수 있는 시점에 영향 |

정상적인 실행 제한이 먼저 도달하도록 **180 < 240 < 300**으로 뒀다. visibility를 240초 이하로 설정하면 Consumer가 시작을 거부한다. 이미 시작된 외부 호출 자체가 즉시 취소되는 것까지 보장하지는 않는다.

중단된 작업이 언제 복구되는지는 남은 visibility 시간, lease 만료, 실행 중인 Consumer 유무에 달려 있다. 항상 “서버가 300초 뒤 자동 처리한다”는 뜻은 아니다.

### 실행 토큰과 이전 실행의 저장 차단

실행이 느려져 lease가 만료됐지만 실제 프로그램은 아직 살아 있을 수도 있다.

```text
워커 A가 선점: 실행 토큰 A
  → lease 만료
워커 B가 재선점: 실행 토큰 B
  → 뒤늦게 워커 A가 결과 저장 시도
  → DB의 현재 토큰 B와 다르므로 저장 거부
```

`execution_token`은 선점할 때마다 바뀐다. 결과 저장 시 `RUNNING` 상태, 토큰 일치, lease 유효성을 검사한다. 이전 실행이 새 결과를 덮어쓰는 것을 막기 위해서다.

이 목적에는 워커 이름인 `worker_id`가 필요하지 않아 제거했다. 같은 워커도 서로 다른 시도를 실행할 수 있으므로, 현재는 **워커의 신원보다 개별 실행의 유효성**을 관리한다. 토큰은 워커 인증 수단이 아니다.

### Job 실패와 DLQ의 구분

Job은 총 4회까지 실행하고 일시 실패 간격은 60/120/240초다. 재시도할 수 없는 오류이거나 횟수를 소진하면 `FAILED`로 종료한다. 삭제된 링크의 작업은 `CANCELLED`로 종료한다.

**DLQ(Dead Letter Queue)**는 반복해서 전달해도 처리되지 않는 메시지를 옮겨 두는 별도 큐다. 파싱할 수 없는 메시지나 장기 DB 장애가 예다. SQS의 수신 횟수는 실제 Job 실행 횟수와 다르므로, Job FAILED와 DLQ 이동은 같은 사건이 아니다.

현재 큐 보관 기간은 4일, DLQ는 14일이며 DLQ 이동 기준은 수신 10회 초과다. DLQ나 보관 기간 만료까지 자동 복구하는 기능은 없다. 운영자의 확인이 필요하다.

### Job 상태와 API 상태의 구분

`Job.status`는 전체 작업 상태이고, 기존 응답의 `processingStatus`는 `links.ai_summary_status`, 즉 **요약 상태**다.

예를 들어 최종 실행에서 요약은 성공하고 임베딩은 실패했다면 Job은 `FAILED`, 요약은 `SUCCESS`일 수 있다. 이 차이와 기존 링크의 호환성을 유지하기 위해 응답 필드와 요약 상태 컬럼을 그대로 뒀다. 내부 Job ID·토큰·횟수는 API 응답에 추가하지 않는다.

## 5. PC 워커 연결 구조

### 워커 수동 전환

워커가 실행되는 위치와 일을 처리하는 방식은 분리돼 있다. 서버와 PC가 같은 DB·SQS에 접근하면 같은 Job을 처리할 수 있다.

| 운영 방식 | API 프로세스 | 별도 워커 프로세스 |
| --- | --- | --- |
| 서버에서 처리 | Publisher 실행, Consumer 켬 | 중지 |
| 별도 머신에서 처리 | Publisher 실행, Consumer 끔 | Consumer 켬 |

Consumer를 켜고 끄는 기존 환경변수는 `SQS_CONSUMER_ENABLED`다. 두 곳 모두 켜면 경쟁 소비하며 PC 우선순위를 보장하지 않는다. PC만 켠 상태에서 PC가 종료되면, 운영자가 서버 Consumer를 켜기 전까지 작업은 기다린다.

현재 단계에서는 heartbeat·워커 등록·자동 전환 로직을 추가하지 않고 수동 전환하기로 합의했다. API의 Publisher는 별도 워커를 사용할 때도 계속 필요하다.

### 수집기 교체 지점

```text
유지: Outbox → SQS → Consumer → Job 선점·저장
교체: 기존 수집기 → PC 브라우저 수집기
유지: 공통 요약·태그·임베딩
```

PC 브라우저 수집기는 아직 구현하지 않았다. 향후 `ContentCollector.collect(url)` 계약을 구현하고 `LinkAnalysisModule`의 `LINK_CONTENT_COLLECTOR` provider를 바꾸는 방식으로 연결할 수 있다. 전체 실행기를 바꿀 때는 `LINK_ANALYSIS_EXECUTOR` 계약을 사용한다.

브라우저 프로필·로그인 세션·사이트별 수집 방식, 비공개 저장소·공통 패키지 분리는 실제 PC 구현 시 정한다. 현재는 교체 지점이 준비된 상태이며, 외부 플러그인 로더를 만든 것은 아니다.

---

이하 내용은 위 개념이 실제 파일·DB·설정에 어떻게 연결되는지 확인할 때 참고한다.

## 6. 코드 구조와 데이터 모델

### 파일별 책임

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

구체적으로 Publisher는 `FOR UPDATE SKIP LOCKED`로 발행할 행을 잠가 여러 Publisher가 같은 Outbox를 동시에 집지 않게 하고, SQS 발행에 10초 제한을 둔다. Job의 선점·저장은 링크 행 → Job 행 순서로 잠근다.

### 테이블과 필드

`links`와 `tags`의 컬럼 변경은 없다. 새 테이블은 두 개다.

#### link_processing_jobs

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

#### link_analysis_outbox

| 컬럼 | 역할 |
| --- | --- |
| `id` | 전달 이벤트 식별자 |
| `job_id` | 전달할 Job. FK이며 Job 물리 삭제 시 CASCADE |
| `available_at` | 발행 가능 시각 |
| `published_at` | 발행 성공 시각. NULL이면 미발행 |
| `created_at` | 생성 시각 |

미발행 `(available_at, id)` 부분 인덱스가 있다.

Outbox는 DB 변경과 **전달 요청의 기록**을 묶는다. 작업 완료·중복 실행 제어는 Job이 맡는다. 재시도 시 Job의 `next_attempt_at`과 Outbox의 `available_at`은 같은 값이다. 별도 Publisher lease·횟수·payload는 없다.

## 7. 실행 설정과 워커 전환

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

## 8. 운영 절차

### 장애 대응과 관측

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

### 최초 운영 적용 순서

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

## 9. 검증 결과와 재현 방법

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

## 10. 구현 현황과 후속 작업

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

다음 작업은 운영 전환과 실제 AWS·수집·AI를 포함한 확인, 그리고 PC 브라우저 수집기 구현이다. 기존에 남은 미처리 링크의 재분석 범위와 FAILED 재실행 방법은 별도로 정한다.

### 구현 커밋

| 커밋 | 내용 |
| --- | --- |
| `6eb9748` | 링크 분석 Job·Outbox 스키마 추가 |
| `f63e716` | Outbox·Job 기반 최초 분석·재시도 전환, 책임 분리, 미사용 worker_id 제거 |
| `ed28572` | 독립 워커 실행·수동 전환 설정·운영 문서 |
| `638d314` | LocalStack 기반 전달·장애 복구 검증 |

위 변경은 로컬 커밋 상태다. 이 문서 정리는 운영 적용을 수행하지 않는다.
