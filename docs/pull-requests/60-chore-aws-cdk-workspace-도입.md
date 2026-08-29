# PR #60: [chore] AWS CDK workspace 도입

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/60
- Author: @vcz-Chan
- Base: main
- Head: chore/aws-cdk-workspace
- Merged: 2026-08-10T13:26:37Z

## PR Body

## 📌 개요

Promise9 서버 저장소에 독립된 `infra/` AWS CDK workspace를 추가합니다.
이 PR은 TypeScript로 인프라를 정의하고 `synth`, `diff`, `deploy`할 수 있는 실행 기반과 `Promise9AccessStack` 골격까지만 도입합니다. 팀 권한은 다음 stacked PR에서 정의합니다.

애플리케이션과 CDK의 의존성·TypeScript 설정은 분리하되, 루트 `bun install`, 단일 `bun.lock`과 CI를 공유하기 위해 `infra/`를 Bun workspace로 구성했습니다.

> Stacked PR 1/3
>
> - Base: `main`
> - Next: [#61 AWS 팀 인프라 관리 Group 추가](https://github.com/mash-up-kr/Promise.9-Server/pull/61)

## ✅ 작업 내용 및 변경 사항

- [x] Bun workspace에 `infra/` 패키지 추가
- [x] CDK CLI와 `aws-cdk-lib` 버전 고정
- [x] `Promise9AccessStack` 진입점과 대상 계정·Region 고정
- [x] 다른 AWS 계정 profile 사용 시 중단하는 안전장치 추가
- [x] 명령에 지정한 현재 CLI profile로 CDK Stack 작업 수행
- [x] CDK 권장 feature flags를 `cdk.json`에 명시
- [x] root package에 bootstrap/synth/diff/deploy/typecheck 명령 추가
- [x] CI에서 CDK typecheck와 synth 실행
- [x] `auth.service.ts`가 직접 사용하는 `@types/ms`를 명시적 devDependency로 선언

## 💬 리뷰어에게

- 팀 AWS 계정과 Region `ap-northeast-2`가 맞는지 확인해 주세요.
- `CliCredentialsStackSynthesizer`를 사용해 명령에 지정한 profile의 자격 증명으로 Stack 작업을 수행합니다.
- `cdk.json`의 다수 항목은 AWS 리소스가 아니라 CDK 동작을 고정하는 공식 권장 feature flags입니다.
- 이 PR의 `AccessStack`은 골격만 포함하며 팀 IAM 리소스는 생성하지 않습니다.
- CDK 인프라 테스트는 별도로 두지 않고 typecheck, synth와 실제 배포 전 diff 리뷰를 검증 기준으로 사용합니다.
- GitHub Actions는 typecheck와 synth만 실행하며 AWS 자동 배포 workflow는 구성하지 않습니다.

## 🔍 상세 내용

| 명령 | 역할 | AWS 변경 |
| --- | --- | --- |
| `bun run infra:typecheck` | CDK TypeScript 타입 검사 | 없음 |
| `bun run infra:synth` | CloudFormation Template 생성 | 없음 |
| `bun run infra:diff` | 코드와 AWS 상태 비교 | 없음 |
| `bun run infra:bootstrap` | CDK 배포 기반 생성 | 있음 |
| `bun run infra:deploy` | 지정한 Stack 배포 | 있음 |

CDK 코드는 `TypeScript → CloudFormation Template → AWS 리소스` 순서로 동작합니다. 이 기반을 통해 이후 IAM, Lightsail, SQS와 SNS를 코드와 PR로 관리할 수 있습니다.

### 이 PR에서 하지 않는 것

- IAM Group, User 또는 Access Key 생성
- 기존 Lightsail 리소스 import 또는 변경
- Secret과 애플리케이션 환경변수 관리
- CDK 자동 배포 구성

### 검증

- GitHub Actions `ci`
- `bun run lint`
- `bun run build`
- `bun run infra:typecheck`
- `bun run infra:synth --profile promise9 --quiet --no-notices`
- `bun run infra:diff Promise9AccessStack --profile promise9`
