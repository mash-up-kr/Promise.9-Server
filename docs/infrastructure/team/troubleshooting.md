# Infrastructure Troubleshooting

## 로그인 세션 만료

```bash
aws login --profile promise9
```

## 브라우저가 열리지 않음

기본 브라우저를 사용할 수 없으면 다른 기기에서 인증한다.

```bash
aws login --remote --profile promise9
```

## AWS CLI 버전

`aws: error: argument command: Invalid choice, valid choices are ...`

`aws login`은 AWS CLI `2.32.0` 이상이 필요하다. `aws --version`을 확인하고 CLI를
업데이트한다.

## profile 없음

`The config profile (promise9) could not be found`

[AWS CLI Setup](./aws-cli.md)의 profile 생성을 다시 진행한다.

## 권한 부족

`AccessDeniedException`

- `aws sts get-caller-identity --profile promise9`으로 계정을 확인한다.
- IAM User가 `Promise9Team` Group에 들어갔는지 관리자에게 확인한다.
- `aws login --profile promise9`으로 다시 로그인한다.
- root나 다른 사람의 계정으로 우회하지 않는다.

## CDK bootstrap 없음

`SSM parameter /cdk-bootstrap/... not found`

직접 다른 계정에 bootstrap하지 않고 팀에 대상 계정과 Region을 확인한다.

## AWS 계정 불일치

선택한 profile의 계정이 Promise9 대상 계정과 다르다는 오류가 발생하면 다음 명령으로
확인한다.

```bash
aws sts get-caller-identity --profile promise9
```

`Account`가 관리자가 안내한 팀 AWS 계정과 다르면 profile 설정을 다시 확인한다.
