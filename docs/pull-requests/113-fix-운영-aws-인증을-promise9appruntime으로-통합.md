# PR #113: [fix] 운영 AWS 인증을 Promise9AppRuntime으로 통합

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/113
- Author: @vcz-Chan
- Base: main
- Head: fix/unify-runtime-iam
- Merged: 2026-09-06T12:21:58Z

## PR Body

## 📌 개요
운영 API가 이메일 전용 IAM 키를 SQS에도 사용하면서 재시도 큐 수신이 `AccessDenied`로 실패합니다. 서버 인증을 기존 `Promise9AppRuntime`으로 통일하고 운영 큐와 SES 발신 identity에 필요한 권한만 부여합니다.

## ✅ 작업 내용 및 변경 사항
- [x] 기존 QueueStack IAM 사용자와 큐의 logical ID 유지
- [x] `Promise9AppRuntime`에 `link-ding-dong.com` identity의 `ses:SendEmail`, `ses:SendBulkEmail` 추가
- [x] EmailStack의 이전 이메일 전용 사용자·정책 제거, SES identity와 DKIM 유지
- [x] 배포 workflow에서 AWS 키·큐 URL·발신 주소 필수 검사
- [x] 공통 런타임 정책은 Access 문서, 운영 전환 절차는 SES 문서로 정리하고 관련 문서에서 링크
- [x] SES 변경 확인에 Email·Queue 두 스택을 포함하고, workflow 중복 조건과 미사용 output 제거

## 💬 리뷰어에게
IAM 권한은 운영 큐의 `SendMessage`, `ReceiveMessage`, `DeleteMessage`와 발신 도메인 identity의 `SendEmail`, `SendBulkEmail`에 한정됩니다. 인프라 관리 권한은 추가하지 않습니다.

**운영 적용 순서를 지켜야 합니다.** QueueStack 먼저 배포 → GitHub Secrets의 AWS 키 한 쌍 교체 → main API 배포 및 인증·SQS·SES 검증 → 이전 키 정리 → EmailStack 배포 순서입니다. 두 스택을 동시에 배포하면 기존 키가 사용 중인 상태에서 이전 사용자가 삭제될 수 있습니다. 수동 발급한 이전 access key가 남아 있어도 IAM 사용자 삭제가 실패할 수 있습니다.

## 🔍 상세 내용
- 삭제: `promise9-email-sender-production` IAM 사용자, 해당 inline policy 및 사용자명 output
- 추가: 기존 `Promise9AppRuntime`의 SES 발송 권한
- 교체 없음: 운영 IAM 사용자, SQS/DLQ, SES identity
- QueueStack은 고정된 발신 도메인 상수로 SES ARN을 구성해 이전 사용자를 제거하는 EmailStack에 배포 의존성이 생기지 않도록 합니다.
- 키는 GitHub Variables가 아닌 repository Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`에 저장합니다. PR에는 비밀값이 없습니다.

검증:
- `bun run infra:typecheck` 통과
- `bun run infra:synth --profile promise9 --quiet --no-notices` 통과
- 운영 AWS 대상 CDK diff 검토: 위 권한 추가와 이전 사용자 제거 외 리소스 교체 없음
- 합성 템플릿 검사: 기존 사용자 logical ID, 정확한 SQS/SES action·resource, EmailStack IAM 제거 확인
- workflow YAML·shell 문법 검사 통과
- `git diff --check` 통과

운영 적용 상태: QueueStack 배포 완료. Promise9AppRuntime의 SQS 3개·SES 2개 action 허용을 검증했고, 최신 main 병합 후 CI 전체 통과했습니다. GitHub Secrets 교체와 머지는 아직 진행 전입니다. 새 런타임 키 생성·GitHub Secrets 전달의 명시적 승인 확인 후 이어서 진행합니다.
