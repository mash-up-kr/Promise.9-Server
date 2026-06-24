# 브랜치 컨벤션

기본 브랜치는 `main`입니다.

## 브랜치 보호

`main` 브랜치에는 별도 보호 규칙을 두지 않습니다.

- `main` 직접 push 허용
- Require PR 비활성화
- 승인, 리뷰, 대화 해결 등 GitHub 강제 규칙 비활성화
- force push 허용
- 브랜치 삭제 허용

## 팀 컨벤션

GitHub가 막지는 않지만, 팀에서는 아래 흐름을 기준으로 작업합니다.

- 의미 있는 변경은 PR로 올려 최소 2명에게 공유합니다.
- PR의 목적은 승인 게이트가 아니라 정보 전달입니다.
- 급한 변경은 `main`에 직접 push할 수 있습니다.
- 특별한 이유가 없다면 의미 있는 변경은 PR을 거칩니다.

## 동작 흐름

```text
[빠른 경로]
main 직접 push
  -> 즉시 반영

[공유 경로]
feature 브랜치
  -> PR 생성
  -> 최소 2명에게 공유
  -> merge commit 병합
```

## 브랜치 네이밍

브랜치 이름은 `<type>/<간단한-설명>` 형식으로 작성합니다.

| type | 용도 | 예시 |
| --- | --- | --- |
| `feature` | 기능 개발 | `feature/login-api` |
| `fix` | 버그 수정 | `fix/token-expire` |
| `refactor` | 리팩터링 | `refactor/user-service` |
| `docs` | 문서 작업 | `docs/ci-guide` |
| `chore` | 설정, 빌드 등 | `chore/eslint-config` |

이슈와 연결된 작업은 이슈 번호를 붙일 수 있습니다.

```text
feature/123-login-api
fix/124-token-expire
docs/125-ci-guide
```
