# AWS Access

## 로그인 방식

팀원마다 개인 IAM User와 MFA를 사용한다. 패스키를 권장하며, 장기 Access Key 대신
`aws login`이 발급하는 단기 자격 증명을 사용한다.

```text
개인 IAM User + MFA
  → Promise9Team
      → AWS CLI와 CDK로 인프라 조회·변경
```

## User와 Group

| 구분           | 역할                                      |
| -------------- | ----------------------------------------- |
| 개인 IAM User  | 팀원별 로그인 계정                        |
| `Promise9Team` | AWS 로그인과 전체 인프라 관리 권한        |
| `Promise9AppRuntime` | 운영 서버가 AWS 서비스를 호출할 때 사용하는 사용자 |

- 모든 팀원은 각자 다른 IAM User를 사용한다.
- 관리자가 IAM User를 `Promise9Team`에 직접 추가한다.
- IAM User와 Group 가입은 public 저장소에 기록하지 않는다.
- 팀원은 `promise9` profile 하나만 사용한다.

## 권한 범위

`Promise9Team`에는 `AdministratorAccess`와 비용 조회 용도를 명시하는
`AWSBillingReadOnlyAccess`가 연결된다. Group 구성원은 Billing과 Cost Explorer에서 비용을
조회할 수 있다.

`AdministratorAccess`가 더 강한 권한이므로 `AWSBillingReadOnlyAccess`는 비용 조회 범위를
제한하지 않는다. Group 구성원은 CDK 배포뿐 아니라 IAM, Access Key와 기존 AWS 리소스를
포함한 계정 전체를 변경할 수 있다.

Billing Console이 보이지 않으면 root가 Account 설정에서 `IAM User and Role Access to
Billing Information`을 활성화해야 한다.

권한이 넓은 대신 다음 운영 규칙을 지킨다.

- 인프라 변경은 `cdk diff`, PR 리뷰와 `main` 반영 후 배포한다.
- AWS Console에서 직접 변경하지 않는다.
- 개인 IAM User의 장기 Access Key를 생성하지 않는다. 서버용 키는 아래 런타임 정책을 따른다.
- 출처를 확인하지 않은 명령이나 스크립트를 실행하지 않는다.
- Lightsail 수동 SSH 접속은 개인 `promise9` profile과 프로젝트의
  `bun run lightsail:ssh` 명령을 사용한다.
- Lightsail default key pair나 공유 PEM 파일을 내려받아 보관하지 않는다.

PR 리뷰와 `main` 반영은 IAM이 강제하지 않는다. 기술적으로는 로컬의 미병합 코드도 배포할
수 있으므로 실행 전에 현재 branch와 `cdk diff`를 확인한다.

## 서버 런타임 권한 정책

운영 서버의 AWS 인증 주체는 `Promise9AppRuntime` 하나로 통일한다. 서버가 실행 중
호출하는 AWS 서비스의 권한을 이 사용자에 모으고, 각 서비스에 필요한 작업과 대상
리소스만 허용한다. 새 서비스를 사용할 때마다 별도 IAM 사용자와 키를 추가하지 않는다.

| 용도 | 인증 주체 | 허용 범위 |
| --- | --- | --- |
| 서버에서 SQS·SES 등 AWS API 호출 | `Promise9AppRuntime` | 애플리케이션 실행에 필요한 작업과 리소스 |
| 인프라 생성·변경·삭제, CDK 배포, IAM 관리 | 개인 IAM User + `Promise9Team` | 팀 인프라 운영 권한 |

`Promise9AppRuntime`을 `Promise9Team`에 가입시키거나 `AdministratorAccess`를 부여하지
않는다. 서버에 개인 배포 계정의 자격 증명을 넣지 않는다.

### 현재 정의한 권한

| 서비스 | 대상 리소스 | 허용 작업 |
| --- | --- | --- |
| SQS | 운영 `promise9-link-analysis` 큐 | `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage` |
| SES | 서울 리전 `link-ding-dong.com` identity | `ses:SendEmail`, `ses:SendBulkEmail` |

사용자와 정책은 `infra/lib/queue-stack.ts`의 `grantRuntimeAccess()`에서 관리한다.
기존 사용자의 logical ID를 유지하기 위해 QueueStack에 두며, 사용자 이름은
`infra/lib/constants.ts`의 `RUNTIME_USER_NAME`으로 정의한다. SES identity 자체는
EmailStack이 관리한다. 위 표는 CDK에 정의한 목표 상태이며, 기존 이메일 전용 키를 쓰는
운영 환경은 [SES 전환 절차](./ses.md#기존-이메일-전용-사용자에서-전환)를 완료해야 한다.

### 새 서비스 권한 추가와 제거

1. 서버가 호출할 AWS API와 대상 리소스를 먼저 정한다.
2. CDK에서 `Promise9AppRuntime`에 필요한 action과 resource ARN만 추가한다.
   예를 들어 S3의 특정 경로에서 파일만 읽는다면 해당 객체 ARN
   `arn:aws:s3:::<버킷명>/<경로>/*`에 `s3:GetObject`만 부여한다. 목록 조회가 필요할 때만
   별도로 버킷 ARN에 `s3:ListBucket`과 필요한 prefix 조건을 검토한다.
3. `infra:typecheck`, `infra:synth`, 대상 스택의 `infra:diff`로 권한 확대 범위를 확인하고
   PR에 목적과 리소스 범위를 기록한다. 리뷰와 main 반영 후 개인 계정으로 CDK를 배포한다.
4. 새 권한을 사용하는 애플리케이션 배포 전에 IAM 정책을 적용한다. 같은 사용자의 권한만
   추가하는 경우 기존 키를 계속 사용하며, GitHub Secrets를 새로 교체할 필요는 없다.
5. 운영 인증 주체와 서비스 접근 결과를 확인한다. HTTP health 성공만으로 SQS·SES 등
   개별 서비스의 권한까지 정상이라고 판단하지 않는다.
6. 기능을 제거하면 실행 중인 서버가 해당 API를 더 이상 호출하지 않는지 확인한 뒤
   사용하지 않는 IAM 권한도 CDK에서 제거한다.

전체 서비스 권한이나 모든 리소스에 대한 권한을 편의상 추가하지 않는다. 리소스별 권한
제한을 지원하지 않는 API가 꼭 필요하다면 해당 예외와 이유를 PR에 명시한다.

### 서버용 자격 증명

Lightsail 서버는 `Promise9AppRuntime`의 access key 한 쌍을 사용한다. SQS와 SES를
포함한 서버의 AWS 클라이언트가 같은 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를
사용하며, 키는 GitHub Actions repository Secrets로 전달한다. 일반 Variables에 저장하지
않는다. 장기 IAM 사용자 키에는 `AWS_SESSION_TOKEN`을 설정하지 않는다.

서버용 키는 CDK 리소스나 output으로 생성하지 않고, 값을 코드·문서·로그에 남기지 않는다.
키 교체 시에는 Secrets 갱신과 API 재배포 후 새 인증 주체를 검증하고 이전 키를 정리한다.
Secrets를 바꿔도 실행 중인 컨테이너의 자격 증명은 자동으로 바뀌지 않는다.

## 팀원 추가

관리자는 [IAM User 관리](./iam-users.md)에 따라 계정을 생성하고 Group에 추가한다.
팀원은 [Team Guide](./team/README.md)에 따라 비밀번호, MFA와 AWS CLI를 설정한다.

## root 정책

root는 최초 계정 설정과 계정 복구에만 사용한다.

- root 비밀번호와 MFA를 공유하지 않는다.
- root Access Key를 만들지 않는다.
- 일상적인 CLI, CDK, 운영 장애 대응에 root를 사용하지 않는다.

## 금지 사항

- 개인 IAM User의 장기 Access Key 생성·공유
- 서버용 access key를 승인된 GitHub Secrets 전달 경로 외에 공유
- 다른 팀원의 IAM User 사용
- `.env`, 토큰, DB URL을 Git, Slack, Notion, 이슈에 노출
- 출처를 확인하지 않은 스크립트에 AWS 자격 증명 전달
- Lightsail 수동 접속용 PEM 파일 다운로드·공유
