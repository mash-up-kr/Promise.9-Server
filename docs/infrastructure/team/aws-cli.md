# AWS CLI Setup

## 관리자가 제공할 것

- AWS IAM 로그인 URL
- 개인 IAM User 이름과 초기 비밀번호

root 비밀번호, AWS Access Key와 다른 팀원의 자격 증명은 공유하지 않는다.

## 1. 콘솔 로그인과 MFA

IAM 로그인 URL에서 개인 사용자로 로그인하고 비밀번호를 변경한다. 우측 상단 사용자명에서
`Security credentials`를 열어 MFA를 등록한다. 피싱에 강하고 `aws login` 브라우저 인증에
사용할 수 있는 패스키를 권장한다.

## 2. AWS CLI 설치

AWS CLI v2를 설치한다.

- macOS: [공식 설치 파일](https://awscli.amazonaws.com/AWSCLIV2.pkg)
- Windows: [공식 설치 파일](https://awscli.amazonaws.com/AWSCLIV2.msi)
- Linux: [AWS CLI 설치 가이드](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

```bash
aws --version
```

`aws login`에는 AWS CLI `2.32.0` 이상이 필요하다.

## 3. promise9 profile

```bash
aws configure set region ap-northeast-2 --profile promise9
aws configure set output json --profile promise9
aws login --profile promise9
```

브라우저가 열리면 개인 IAM User와 MFA로 인증한다.

```bash
aws sts get-caller-identity --profile promise9
aws lightsail get-instances \
  --query "instances[].{Name:name,State:state.name}" \
  --profile promise9
```

`Account`가 `743070678932`이고, `Arn`이 본인의 IAM User이며 `root`가 아닌지 확인한다.

`Promise9Team`은 전체 관리자 권한을 가진다. profile과 로그인 세션을 다른 사람이나
스크립트에 전달하지 않고, 인프라 변경은 팀 절차에 따라 실행한다.

작업을 마치면 로그인 세션을 종료한다.

```bash
aws logout --profile promise9
```

다음 단계: [CDK Guide](./cdk.md)

## 참고

- [`aws login` 설정](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)
