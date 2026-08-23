# AWS SES

`Promise9EmailStack`은 링크 리마인드 이메일을 발송하기 위한 SES 발신 도메인과
애플리케이션 IAM User를 관리한다.

## 관리 리소스

| 리소스             | 이름                               | 역할                                  |
| ------------------ | ---------------------------------- | ------------------------------------- |
| SES Email identity | `link-ding-dong.com`               | 도메인 내 발신 주소 검증 및 DKIM 서명 |
| IAM User           | `promise9-email-sender-production` | 운영 이메일 발송                      |
| IAM User           | `promise9-email-sender-stage`      | Stage 이메일 발송                     |

각 IAM User에는 SES identity의 `ses:SendEmail`만 허용한다. 운영과 Stage access key를
분리해 환경별 사용 내역과 키 폐기·교체 주기를 독립적으로 관리한다.

CDK는 장기 access key를 만들거나 출력하지 않는다. CloudFormation output에 secret access
key가 남는 것을 방지하기 위해서다.

## 최초 설정

Stack을 배포한다.

```bash
bun run infra:typecheck
bun run infra:synth --profile promise9
bun run infra:diff Promise9EmailStack --profile promise9
bun run infra:deploy Promise9EmailStack --profile promise9
```

배포 output의 `DkimRecord1Name`~`DkimRecord3Name`과 각 `Value`를 도메인의 DNS에 CNAME
레코드로 등록한다. SES Console에서 `link-ding-dong.com` identity 상태가 `Verified`이고
DKIM 상태가 `Successful`인지 확인한다.

SES 계정이 sandbox 상태라면 운영 액세스를 요청한다. Sandbox에서는 검증한 수신자에게만
보낼 수 있다.

도메인 identity가 검증되면 `reminder@link-ding-dong.com`처럼 도메인에 속한 주소를 별도
이메일 identity나 실제 메일함 생성 없이 발신 주소로 사용할 수 있다. 해당 주소로 답장을
받아야 한다면 `EmailService.send()`의 `replyTo`에 실제 수신 가능한 주소를 지정한다.

## 런타임 자격 증명

IAM access key는 환경별 IAM User에서 한 번 발급하고 다음 GitHub Secrets에 저장한다.

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- 임시 자격 증명을 사용할 때만 `AWS_SESSION_TOKEN`
- `EMAIL_FROM_ADDRESS` (`reminder@link-ding-dong.com` 등 identity 도메인 주소이며 실제
  메일함은 필요하지 않음)

운영 repository secrets와 Stage environment secrets에는 서로 다른 IAM User의 값을 넣는다.
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
