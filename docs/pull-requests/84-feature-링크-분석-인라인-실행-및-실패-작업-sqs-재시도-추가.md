# PR #84: [feature] 링크 분석 인라인 실행 및 실패 작업 SQS 재시도 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/84
- Author: @Choi-JY1107
- Base: main
- Head: feat/sqs-link-analysis
- Merged: 2026-08-31T17:48:11Z

## PR Body

## 📌 개요

링크 저장 시 정보 수집, AI 요약,AI 태그, 임베딩을 응답 이후 **인라인으로 먼저 실행(Fire and Forgot**)하고, 재시도 가능한 실패만 SQS 큐에 넘겨 나중에 재처리합니다.
즉 큐는 정상 경로가 아니라 **재시도 경로**이며, 모든 작업이 성공하면 SQS를 호출하지 않습니다.
큐, DLQ, IAM까지 CDK로 정의하고 실제 AWS에 배포해, 코드부터 인프라까지 동작하는 상태입니다.

<br>

## ✅ 작업 내용 및 변경 사항

- [x] 링크 분석을 `CONTENT` / `SUMMARY` / `TAGS` / `EMBEDDING` 4개 작업으로 분리하고, 인라인·재시도가 `LinkAnalysisService.run()` 하나를 공유
- [x] 실패를 `RETRYABLE` / `PERMANENT`로 분류해 재시도 가능한 것만 큐에 발행 (429 제외 4xx와 LLM 설정 오류는 재시도 안 함)
- [x] 재시도를 **작업 단위**로 좁혀 재발행 — 요약 성공·태그 실패면 태그만 다시 실행하므로 성공한 AI 호출이 중복 결제되지 않음
- [x] 시도 상한을 코드(`LINK_ANALYSIS_MAX_ATTEMPTS = 4`)로 제어하고 `DelaySeconds`로 60초 → 120초 → 240초 백오프
- [x] `enableShutdownHooks()` + 진행 중 작업 최대 15초 drain으로 배포 중 유실 완화
- [x] 임베딩 트리거를 `analysis/`의 `EMBEDDING` 작업 한 곳으로 통일하고 `embedLinkSafe` 제거 — 제목·요약이 저장된 뒤 최신 행으로 임베딩해 검색 품질 개선
- [x] SQS 수신 실패에 1초 → 30초 백오프 추가 (큐 URL·IAM 오류 시 초당 1회 에러 로그 폭주 방지)
- [x] `fix`: 임베딩 저장 조건의 jsonb 파라미터 직렬화 오류 — 메모 수정 후 재임베딩이 조용히 실패하던 문제
- [x] `fix`: AI 실패의 재시도 가능 여부를 `AiGenerationError.retryable`로 노출해 링크 분석이 provider 예외 타입을 몰라도 되게 정리
- [x] `Promise9QueueStack`(CDK): 큐·DLQ 각 2개(prod/stage) + 런타임 IAM 사용자
- [x] 배포 워크플로(production/stage)에 큐 환경변수 주입
<br>

## 💬 리뷰어에게

**1. Lightsail의 액세스 키 사용**

Lightsail 인스턴스는 EC2처럼 IAM role을 붙일 수 없어 장기 액세스 키를 쓸 수밖에 없었습니다.
키가 CloudFormation에 남지 않도록 CDK에서는 만들지 않고 콘솔 발급 → GitHub Secrets 경로로 했습니다.
더 나은 방법 아시면 알려주세요.

**⚠️ 로컬 개발 주의**

로컬 `.env`에 production 큐 URL을 넣지 마세요.
로컬 consumer가 production 재시도 메시지를 가져가 로컬 DB로 처리하고 큐에서 삭제해버립니다.
로컬은 LocalStack(`SQS_ENDPOINT`)을 쓰거나 `SQS_CONSUMER_ENABLED=false`로 두면 됩니다.

<br>

## 🔗 관련 이슈

<br>

## 🔍 상세 내용

### 동작 흐름

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

### 적용 엔드포인트

| 엔드포인트 | 실행하는 작업 |
| --- | --- |
| `POST /api/v1/links` | 전체(4개) |
| `PATCH /api/v1/links/:linkId` | `EMBEDDING`만 (메모가 바뀔 때) |
| `POST /api/v1/links/:linkId/restore` | 없음 |

### 작업 단위

| 작업 | 내용 |
| --- | --- |
| `CONTENT` | 크롤링 후 제목·설명 저장. 본문은 DB에 보관하지 않음 |
| `SUMMARY` | AI 요약 생성 및 `aiSummary`·`aiSummaryStatus` 저장 |
| `TAGS` | AI 태그 생성 후 기존 AI 태그를 transaction에서 교체 |
| `EMBEDDING` | 제목·요약 반영된 최신 행으로 검색용 벡터 생성 |

### 배포된 인프라

| 환경 | 큐 | DLQ |
| --- | --- | --- |
| production | `promise9-link-analysis` | `promise9-link-analysis-dlq` |
| stage | `promise9-link-analysis-stage` | `promise9-link-analysis-stage-dlq` |

- visibility 300초(코드 기본값과 일치), retention 4일, long polling 20초, `maxReceiveCount` 3
- 메시지에 사용자 링크 URL이 담기므로 SQS 관리형 키로 저장 암호화 + HTTPS 강제
- **환경별 분리**: prod와 stage는 DB가 달라 큐를 공유하면 stage consumer가 prod 재시도 메시지를 가져가 링크를 못 찾고 건너뜀
- IAM 사용자 `Promise9AppRuntime` — 두 큐 ARN에만 `SendMessage`/`ReceiveMessage`/`DeleteMessage`

### 부수적으로 정리한 것

- `describeError` / `describeErrorStack` 유틸로 7곳에 중복돼 있던 `error instanceof Error ? ... : String(error)` 통합
- consumer를 별도 파일로 분리해 순환 참조 제거 (`consumer → dispatcher → publisher`)
- `LinkService`에서 임베딩·분석 트리거 중복 호출 제거

<br>
