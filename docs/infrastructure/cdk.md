# AWS CDK 사용 및 배포

CDK 도입 이유는 [왜 AWS CDK를 사용하는가?](./why-cdk.md)를 참고한다.

## 명령

| 명령                      | 권한          | AWS 변경 |
| ------------------------- | ------------- | -------- |
| `bun run infra:synth`     | 로컬          | 없음     |
| `bun run infra:diff`      | `Promise9Team` | 없음     |
| `bun run infra:bootstrap` | `Promise9Team` | 있음     |
| `bun run infra:deploy`    | `Promise9Team` | 있음     |

## 자동화 범위

- 팀원은 `promise9` profile 하나로 `synth`, `diff`와 `deploy`를 실행한다.
- GitHub Actions는 `main` 대상 PR에서 `typecheck`, `synth`만 실행하며 AWS 자격 증명을
  사용하지 않는다.
- CDK 자동 배포 workflow는 구성하지 않는다.
- 기존 Stage와 운영 Lightsail workflow는 애플리케이션 배포이며 CDK 배포와 별개다.

## 변경 절차

```text
infra/ 수정
  → synth/diff 확인
  → PR에 삭제·교체·IAM 확대 여부 기록
  → 팀 리뷰
  → main 반영
  → diff 재확인 후 대상 Stack 배포
```

- `diff`의 삭제, 교체, IAM 권한 확대는 반드시 PR에 명시한다.
- PR과 `main` 확인은 IAM이 강제하지 않는 팀 운영 규칙이다.
- CDK 대상 AWS 계정은 코드에 고정하며 다른 계정 profile이면 실행을 중단한다.
- 배포할 Stack 이름을 명시하고 `--all`은 사용하지 않는다.

## 최초 적용 순서

`Promise9Team`이 아직 없을 때만 기존 관리자 권한이 있는 개인 profile을 사용한다.

```bash
bun install
bun run infra:typecheck
bun run infra:synth --profile <초기-관리자-profile>
bun run infra:diff Promise9AccessStack --profile <초기-관리자-profile>
bun run infra:bootstrap \
  --profile <초기-관리자-profile> \
  aws://743070678932/ap-northeast-2
bun run infra:deploy Promise9AccessStack \
  --profile <초기-관리자-profile>
```

배포 후 관리자의 IAM User도 `Promise9Team`에 넣고 `promise9` profile로 검증한다. 검증이
끝나면 개인 User에 직접 연결했던 관리자 정책을 제거한다.

팀 사용법은 [CDK Guide](./team/cdk.md)를 따른다.

## 참고

- [AWS CDK 시작하기](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
- [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)
