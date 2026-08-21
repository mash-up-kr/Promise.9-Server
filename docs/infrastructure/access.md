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
- Access Key를 생성하지 않는다.
- 출처를 확인하지 않은 명령이나 스크립트를 실행하지 않는다.
- Lightsail 수동 SSH 접속은 개인 `promise9` profile과 프로젝트의
  `bun run lightsail:ssh` 명령을 사용한다.
- Lightsail default key pair나 공유 PEM 파일을 내려받아 보관하지 않는다.

PR 리뷰와 `main` 반영은 IAM이 강제하지 않는다. 기술적으로는 로컬의 미병합 코드도 배포할
수 있으므로 실행 전에 현재 branch와 `cdk diff`를 확인한다.

## 팀원 추가

관리자는 [IAM User 관리](./iam-users.md)에 따라 계정을 생성하고 Group에 추가한다.
팀원은 [Team Guide](./team/README.md)에 따라 비밀번호, MFA와 AWS CLI를 설정한다.

## root 정책

root는 최초 계정 설정과 계정 복구에만 사용한다.

- root 비밀번호와 MFA를 공유하지 않는다.
- root Access Key를 만들지 않는다.
- 일상적인 CLI, CDK, 운영 장애 대응에 root를 사용하지 않는다.

## 금지 사항

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 생성·공유
- 다른 팀원의 IAM User 사용
- `.env`, 토큰, DB URL을 Git, Slack, Notion, 이슈에 노출
- 출처를 확인하지 않은 스크립트에 AWS 자격 증명 전달
- Lightsail 수동 접속용 PEM 파일 다운로드·공유
