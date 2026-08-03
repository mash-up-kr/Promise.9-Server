# 왜 AWS CDK를 사용하는가?

## CDK란?

IaC(Infrastructure as Code)는 AWS 리소스를 Console에서 직접 만드는 대신 코드로 정의하고
관리하는 방식이다.

CloudFormation은 AWS 공식 IaC 서비스로, YAML 또는 JSON Template을 사용한다.

AWS CDK는 TypeScript 같은 프로그래밍 언어로 인프라를 정의하면 이를 CloudFormation
Template으로 변환해 주는 도구다. Promise9에서는 TypeScript를 사용한다.

```text
TypeScript CDK 코드 → cdk synth → CloudFormation Template → AWS 리소스
```

## 도입 이유

Promise9는 팀 IAM 권한, 기존 Lightsail Instance와 Static IP, 앞으로 추가할 SQS, DLQ,
SNS 등의 AWS 리소스를 코드로 관리한다.

Console에서 직접 관리하면 변경 이력과 리뷰가 남지 않고, 같은 구성을 다시 만들기
어렵다. 리소스가 연결될수록 문서와 실제 AWS 상태가 달라질 가능성도 커진다.

## 얻는 효과

- TypeScript 타입 검사와 IDE 자동완성을 사용한다.
- 인프라 변경도 PR과 Git history로 리뷰하고 추적한다.
- 이름, Region, 태그와 권한을 동일하게 재현한다.
- `cdk diff`로 삭제, 교체와 IAM 권한 확대를 배포 전에 확인한다.
- 반복되는 리소스 조합을 Construct로 재사용한다.
- AWS CLI로 현재 인프라 상태를 조회하고, CDK 코드로 변경안을 작성·검증할 수 있어 AI를
  인프라 관리 과정에 활용할 수 있다.

AI는 typecheck, `synth`와 `diff`까지 보조하고, 실제 배포는 사람이 변경사항을 검토한 뒤
실행한다.

CDK가 모든 오류를 사전에 막아주지는 않는다. 서비스 제한, 권한 부족과 리소스 충돌은
typecheck, `synth`, `diff`와 실제 배포 검증이 필요하다.

## 비용

IAM, AWS CLI와 CDK 자체에는 추가 요금이 없다. CDK bootstrap 저장소와 CDK가 생성하는
AWS 리소스에는 각 서비스 사용량에 따른 요금이 발생할 수 있다.

## Promise9 관리 원칙

- `infra/`를 AWS 인프라 정의의 기준으로 사용한다.
- 개인 IAM User 생성과 Group 가입은 관리자가 수행한다.
- Team Group 권한은 CDK로 관리한다.
- 팀원은 `aws login`으로 발급받은 단기 자격 증명과 하나의 profile을 사용한다.
- Secret 값은 CDK 코드와 CloudFormation Template에 넣지 않는다.
- Console에서 긴급 변경했다면 동일한 내용을 코드에 즉시 반영한다.
- SQS와 SNS는 처리 방식과 재시도 정책이 결정된 후 추가한다.

## 프로젝트 구조

```text
infra/
├── bin/promise9-infra.ts
└── lib/
    ├── access-stack.ts
    ├── constants.ts
    └── lightsail-stack.ts
```

리소스가 늘어나면 기능별 Stack과 공통 Construct로 분리한다.
