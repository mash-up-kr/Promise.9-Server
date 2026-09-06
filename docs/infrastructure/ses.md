# AWS SES

`Promise9EmailStack`은 링크 리마인드 이메일을 발송하기 위한 SES 발신 도메인을 관리한다.
서버 인증은 `Promise9QueueStack`이 관리하는 `Promise9AppRuntime`으로 통일한다.

## 관리 리소스

| 리소스             | 이름                               | 역할                                  |
| ------------------ | ---------------------------------- | ------------------------------------- |
| SES Email identity | `link-ding-dong.com`               | 도메인 내 발신 주소 검증 및 DKIM 서명 |
| IAM User (QueueStack) | `Promise9AppRuntime` | 운영 SQS 재시도와 SES 이메일 발송 |

SES 권한은 이 도메인 identity의 `ses:SendEmail`, `ses:SendBulkEmail`로 제한한다.
같은 사용자에 운영 분석 큐의 송신·수신·삭제 권한만 추가하며 인프라 관리 권한은 주지 않는다.

CDK는 장기 access key를 만들거나 출력하지 않는다. CloudFormation output에 secret access
key가 남는 것을 방지하기 위해서다.

## 최초 설정

Stack을 배포한다.

```bash
bun run infra:typecheck
bun run infra:synth --profile promise9
bun run infra:diff Promise9EmailStack --profile promise9
bun run infra:deploy Promise9EmailStack --profile promise9
bun run infra:deploy Promise9QueueStack --profile promise9
```

배포 output의 `DkimRecord1Name`~`DkimRecord3Name`과 각 `Value`를 도메인의 DNS에 CNAME
레코드로 등록한다. SES Console에서 `link-ding-dong.com` identity 상태가 `Verified`이고
DKIM 상태가 `Successful`인지 확인한다.

SES 계정이 sandbox 상태라면 운영 액세스를 요청한다. Sandbox에서는 검증한 수신자에게만
보낼 수 있다.

도메인 identity가 검증되면 `reminder@link-ding-dong.com`처럼 도메인에 속한 주소를 별도
이메일 identity나 실제 메일함 생성 없이 발신 주소로 사용할 수 있다. 해당 주소로 답장을
받아야 한다면 `EmailService.send()`의 `replyTo`에 실제 수신 가능한 주소를 지정한다.

## 애플리케이션 발송

`EmailService.send()`는 단건을, `EmailService.sendBulk()`는 같은 템플릿을 사용하는 여러 건을
발송한다. `sendBulk()`는 애플리케이션의 HTML을 SES inline template으로 전달하므로 SES에
별도 template 리소스를 만들 필요가 없다.

Bulk 발송에서도 각 항목은 독립된 `Destination`을 사용한다. 각 항목에는 한 명의 `to`와 그
수신자에게 보낼 template 치환값만 지정하므로 다른 사용자의 주소나 링크 내용이 이메일에
노출되지 않는다. `cc`와 `bcc`는 사용하지 않는다. SES의 요청당 destination 제한에 맞춰
50건씩 자동 분할하고, 반환된 항목별 결과는 입력 항목과 같은 순서로 제공한다. 호출부는
성공한 건만 처리 완료해야 한다. Bulk 발송은 API 호출 수를 줄이지만 SES 과금과 발송 quota는
실제 수신자 수를 기준으로 계산된다.

SES는 template 치환값을 HTML escape하지 않는다. 사용자 입력을 HTML에 넣는 호출부는
치환값을 escape해야 한다. Configuration set을 사용하는 경우 Rendering Failure 이벤트를
수집하도록 event destination도 함께 구성한다.

## 런타임 자격 증명

`Promise9AppRuntime`의 access key 한 쌍을 다음 GitHub Actions repository Secrets에 저장한다.
SQS와 SES가 같은 `AWS_*` 자격 증명을 사용하므로 이메일 전용 사용자의 키로 덮어쓰지 않는다.

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- 임시 자격 증명을 사용할 때만 `AWS_SESSION_TOKEN`
- `EMAIL_FROM_ADDRESS` (`reminder@link-ding-dong.com` 등 identity 도메인 주소이며 실제
  메일함은 필요하지 않음)

키 값을 저장소, 로그, PR 또는 CDK output에 기록하지 않는다. 키가 노출되면 즉시 비활성화한
뒤 교체한다.

애플리케이션은 기본적으로 `ap-northeast-2`의 SES를 사용한다. 다른 리전을 사용하려면 그
리전에도 identity를 별도로 검증하고 `EMAIL_SES_REGION`을 변경해야 한다.

## 변경 확인

```bash
bun run infra:typecheck
bun run infra:synth --quiet --no-notices
bun run infra:diff Promise9EmailStack --profile promise9
```

Email identity에는 `RemovalPolicy.RETAIN`을 적용하고 Stack에는 termination protection을
적용한다. IAM 권한 확대나 identity 교체가 diff에 표시되면 배포 전에 별도로 검토한다.

## 기존 이메일 전용 사용자에서 전환

기존 운영 환경은 `promise9-email-sender-production`의 키로 SES와 SQS를 모두 호출해
SQS `AccessDenied`가 발생했다. 키만 기존 `Promise9AppRuntime`으로 바꾸면 SES 권한이
없어 이메일이 실패하므로 아래 순서를 지킨다.

1. `Promise9QueueStack`만 먼저 diff/deploy하여 기존 `Promise9AppRuntime`에 SES 권한을 추가한다.
2. IAM 정책 검증으로 운영 큐의 `SendMessage`, `ReceiveMessage`, `DeleteMessage`와
   SES identity의 `SendEmail`, `SendBulkEmail`이 모두 허용되는지 확인한다.
3. `Promise9AppRuntime` 키로 GitHub Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를
   함께 교체한다. 장기 IAM 사용자 키를 사용하므로 `AWS_SESSION_TOKEN`은 설정하지 않는다.
   두 Secrets가 교체되는 동안 배포가 실행되지 않게 한다. 새 키의 시크릿은 생성 시에만
   조회할 수 있으므로 로그나 파일에 남기지 않고 Secrets로 전달한다.
4. `main`의 `Deploy To Lightsail`을 실행하고 실제 컨테이너 인증 주체와 SQS 오류 해소,
   SES 권한, API health를 확인한다. GitHub Secrets 변경만으로 실행 중인 컨테이너는 바뀌지 않는다.
5. 다른 사용처가 없는지 확인한 뒤 기존 이메일 전용 사용자의 access key를 비활성화·삭제한다.
6. 마지막으로 `Promise9EmailStack`을 diff/deploy해 이전 사용자와 전용 정책을 삭제한다.
   수동으로 발급한 access key가 남아 있으면 IAM 사용자 삭제가 실패할 수 있다.

전환 전 두 스택을 한꺼번에 배포하지 않는다. EmailStack에서 이전 사용자가 먼저 삭제되면
실행 중인 API의 이메일 인증이 끊긴다. QueueStack은 기존 IAM 사용자와 큐의 logical ID를
유지하며, SES ARN을 도메인 상수로 구성해 이 선적용에 EmailStack 배포가 딸려오지 않게 한다.
SES identity와 DKIM 리소스는 교체하지 않는다.
