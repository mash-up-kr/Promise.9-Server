# 머지 컨벤션

## 머지 전략

PR은 GitHub의 **Create a merge commit** 옵션으로 병합합니다.

이 방식은 작업 브랜치의 커밋을 `main`에 남기고, 별도의 병합 커밋을 추가합니다.

```text
*   Merge pull request #12 from feature/login-api
|\
| * feat: 로그인 응답 DTO 추가
| * feat: 로그인 API 컨트롤러 구현
|/
* 이전 main
```

## Merge commit을 사용하는 이유

- 각 커밋의 작업 맥락을 남길 수 있습니다.
- 어떤 PR에서 들어온 변경인지 병합 커밋으로 구분됩니다.
- 작업 브랜치 갱신도 `rebase`보다 `merge`를 쓰는 흐름과 맞습니다.

Merge commit만 쓰기로 정하면 GitHub Settings에서 Squash merge와 Rebase merge 버튼을 끄는 편이 좋습니다.

## 머지 전 체크리스트

- 충돌이 없는지 확인합니다.
- 필요한 경우 최신 `main`을 작업 브랜치에 병합합니다.
- 최소 2명에게 변경 내용을 공유합니다.
- CI가 있으면 통과 여부를 확인합니다.

## 충돌 해결

`main`이 앞서 나가 충돌이 생기면 작업 브랜치에서 최신 `main`을 병합합니다.

```bash
git checkout feature/xxx
git fetch origin
git merge origin/main
git push
```

작업 브랜치 갱신도 `rebase`가 아닌 `merge`를 사용합니다.
