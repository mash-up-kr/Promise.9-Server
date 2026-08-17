# 링크 분석 SQS 설정

링크 저장 API는 DB 저장 후 `promise9-link-analysis` 큐에 메시지를 발행한다. NestJS
애플리케이션의 consumer는 long polling으로 메시지를 받아 링크 정보 수집, AI 요약 및 태그
생성을 실행한다. 처리가 성공한 메시지만 삭제되므로 수집·AI 생성·결과 저장 실패는
visibility timeout 이후 다시 전달된다.

<br>

## 적용 엔드포인트

| 엔드포인트 | 발행 여부 | 비고 |
| --- | --- | --- |
| `POST /api/v1/links` | O | 링크 신규 저장. 유일한 발행 지점 |
| `PATCH /api/v1/links/:linkId` | X | 제목·폴더 등 수정만 하고 재분석하지 않는다 |
| `POST /api/v1/links/:linkId/restore` | X | 복원 시 기존 분석 결과를 그대로 쓴다 |

발행은 `LinkService.create()` 안에서만 일어난다. 같은 `normalizedUrl`은 `assertNotDuplicated`가
먼저 막으므로 중복 발행되지 않는다.

<br>

## 동작 방식

```
POST /api/v1/links
  ├─ 링크 DB 저장                        (동기)
  ├─ SQS SendMessage                     (동기, 실패 시 아래 참조)
  └─ 201 응답 — aiSummaryStatus=PENDING

        promise9-link-analysis 큐
                  │  long polling 20초, 한 번에 1건
                  ▼
        LinkAnalysisQueueConsumer
          └─ LinkAnalysisService.analyze()
               ├─ 링크 정보 수집(크롤링)
               ├─ AI 요약 생성·저장
               └─ AI 태그 생성·교체
          └─ 성공 시에만 DeleteMessage
```

메시지 본문은 `version`, `linkId`, `userId`, `url` 네 필드이며 수신 시 zod로 검증한다.
`version`은 포맷 변경에 대비한 필드로 현재 값은 `1`이다.

consumer는 애플리케이션 부팅 시(`OnModuleInit`) polling 루프를 시작하고, 종료 시
`AbortController`로 진행 중인 receive를 끊는다.

<br>

## 실패 처리

| 실패 지점 | 동작 |
| --- | --- |
| SQS 발행 실패 | 링크는 저장된 상태로 두고 `aiSummaryStatus`를 `FAILED`로 기록해 `PENDING` 고착을 막는다 |
| 수집·AI 생성·저장 실패 | 메시지를 삭제하지 않아 visibility timeout 후 재전달된다. `maxReceiveCount` 초과 시 DLQ로 이동 |
| 메시지 파싱 실패 | 위와 같이 재시도되고 결국 DLQ로 이동한다 |

요약과 태그는 `Promise.allSettled`로 각각 시도하므로 한쪽이 실패해도 다른 쪽 결과는 저장된다.
단, 실패가 하나라도 있으면 예외를 다시 던져 메시지가 재시도된다. 즉 재시도는 링크 단위이며
성공했던 작업도 함께 다시 실행된다.

<br>

## 권장 큐 설정

- Queue type: Standard
- Receive message wait time: 20초
- Visibility timeout: 300초 이상(링크 분석 최대 실행 시간보다 길어야 함)
- Retention period: 4일
- DLQ: 별도 Standard queue 연결
- Redrive `maxReceiveCount`: 3

Standard queue는 같은 메시지를 두 번 이상 전달할 수 있다. 분석 결과 저장은 동일 `linkId`를
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

배포 전에 visibility timeout과 코드의 `SQS_VISIBILITY_TIMEOUT_SECONDS`를 동일하게 맞추고,
DLQ redrive policy가 실제 source queue에 연결되어 있는지 확인한다.

<br>

## 관련 코드

| 파일 | 역할 |
| --- | --- |
| `src/infrastructure/sqs/sqs.service.ts` | `SQSClient` 래퍼. send·receive·delete |
| `src/modules/link/analysis/link-analysis.queue.ts` | publisher와 consumer |
| `src/modules/link/link.service.ts` | `create()`에서 메시지 발행 |
| `src/config/environment.ts` | `SQS_*` 환경변수 검증 |
