# Issues

GitHub Issue가 생성되면 GitHub Actions가 이 폴더에 이슈 스냅샷을 Markdown 파일로 기록합니다.

파일명은 `이슈번호-슬러그.md` 형식을 사용합니다.

## 자동화 흐름

1. GitHub Issue를 생성합니다.
2. 이슈 라벨을 기준으로 작업 타입을 정합니다.
3. `{type}/{issue-number}-{slug}` 형식의 브랜치를 생성합니다.
4. 이슈 제목, 본문, 작성자, 라벨, 생성일을 `docs/issues/`에 기록합니다.
5. 이슈 문서 커밋을 원격 브랜치에 push합니다.
6. 해당 브랜치에서 Draft PR을 생성합니다.
7. 이후 작업 커밋을 같은 PR에 이어서 쌓습니다.
8. 작업 완료 후 `Ready for review`로 전환하고, 팀 컨벤션에 따라 Merge commit으로 병합합니다.

## 타입 매핑

| 이슈 라벨 | 브랜치/PR 타입 |
| --- | --- |
| `feature` | `feature` |
| `bug`, `fix`, `hotfix` | `fix` |
| `docs`, `agreement` | `docs` |
| `refactor` | `refactor` |
| `chore` 또는 기타 | `chore` |
