# CDK Guide

## 준비

- `Promise9AccessStack`과 CDK bootstrap 적용이 완료되어 있어야 한다.
- 저장소를 clone한 뒤 모든 명령을 저장소 루트에서 실행한다.
- 저장소가 지정한 Bun `1.3.14`를 사용한다. `bun --version`으로 확인한다.
- CDK를 전역 설치하지 않는다. `bun install`이 `infra/` workspace에 고정된 CDK CLI를
  함께 설치한다.
- [AWS CLI Setup](./aws-cli.md)에 따라 `promise9` profile로 로그인한다.

CDK는 명령에 지정한 `promise9` profile의 단기 자격 증명을 사용한다.

## 변경 확인

```bash
bun install
bun run infra:typecheck
bun run infra:synth --profile promise9
bun run infra:diff Promise9AccessStack --profile promise9
```

- `synth`가 실패하지 않는지 확인한다.
- `diff`의 삭제, 교체, IAM 권한 확대를 PR에 적는다.
- 이해하지 못한 변경은 배포하지 않고 팀에 확인한다.

## 팀 변경 절차

```text
infra/ 수정 → synth/diff → PR → 팀 리뷰 → main → diff 재확인 → 배포
```

GitHub Actions는 `main` 대상 PR에서 `typecheck`, `synth`만 실행하고 AWS를 변경하지 않는다.
`diff`와 `deploy`는 자동 실행하지 않는다.

`main` 반영 후 동일한 profile로 diff를 다시 확인하고 대상 Stack을 배포한다.

```bash
bun run infra:diff Promise9AccessStack --profile promise9
bun run infra:deploy Promise9AccessStack --profile promise9
```

관리 범위와 정책은 [AWS CDK](../cdk.md)를 참고한다.
