# 링크 분석 SQS 설정

링크 저장 API는 DB 저장 후 `promise9-link-analysis` 큐에 메시지를 발행한다. NestJS
애플리케이션의 consumer는 long polling으로 메시지를 받아 링크 정보 수집, AI 요약 및 태그
생성을 실행한다. 처리가 성공한 메시지만 삭제되므로 수집·AI 생성·결과 저장 실패는
visibility timeout 이후 다시 전달된다.

## 권장 큐 설정

- Queue type: Standard
- Receive message wait time: 20초
- Visibility timeout: 300초 이상(링크 분석 최대 실행 시간보다 길어야 함)
- Retention period: 4일
- DLQ: 별도 Standard queue 연결
- Redrive `maxReceiveCount`: 3

Standard queue는 같은 메시지를 두 번 이상 전달할 수 있다. 분석 결과 저장은 동일 `linkId`를
갱신하고 AI 태그는 transaction에서 교체하므로 중복 처리해도 최종 데이터가 중복되지 않는다.

## IAM 권한

애플리케이션이 사용하는 IAM principal에 대상 queue ARN으로 아래 권한을 부여한다.

- `sqs:SendMessage`
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`

AWS SDK 기본 credential provider chain을 사용하므로 액세스 키를 코드나 저장소에 넣지 않는다.
실행 환경의 IAM role을 우선 사용하고, 불가능한 환경에서만 안전하게 주입된
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를 사용한다.

## 환경변수

필수 설정은 `AWS_REGION`, `SQS_LINK_ANALYSIS_QUEUE_URL`이다. 한 애플리케이션 인스턴스가
API와 consumer를 함께 실행하는 것이 기본값이다. 발행만 담당할 인스턴스에서는
`SQS_CONSUMER_ENABLED=false`로 polling을 끌 수 있다. 전체 항목과 기본값은
`.env.example`을 참고한다.

배포 전에 visibility timeout과 코드의 `SQS_VISIBILITY_TIMEOUT_SECONDS`를 동일하게 맞추고,
DLQ redrive policy가 실제 source queue에 연결되어 있는지 확인한다.
