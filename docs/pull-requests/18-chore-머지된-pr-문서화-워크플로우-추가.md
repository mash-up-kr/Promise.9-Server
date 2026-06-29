# PR #18: [chore] 머지된 PR 문서화 워크플로우 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/18
- Author: @vcz-Chan
- Base: main
- Head: chore/archive-merged-pr-docs
- Merged: 2026-06-29T12:16:14Z

## PR Body

## 📌 작업 내용
| PR이 `main`에 머지되면 해당 PR 본문을 Markdown 문서로 저장하고, 문서화 커밋을 `main`에 자동 push하는 GitHub Actions 워크플로우를 추가했습니다.

<br>

## ✅ 변경 사항
- [x] `pull_request_target`의 `closed` 이벤트에서 머지된 PR만 처리
- [x] PR 본문을 `docs/pull-requests/{PR번호}-{PR제목슬러그}.md`로 저장
- [x] 자동 생성 커밋 메시지를 `docs: PR #번호 PR제목 문서화` 형식으로 지정
- [x] 동시 머지 시 충돌 가능성을 줄이기 위해 `concurrency`와 `git pull --ff-only` 적용

<br>

## 📷 스크린샷 (선택)

<br>

## 🔗 관련 이슈
| 없음

<br>

## 💬 리뷰어에게
1. 개발자가 PR을 main으로 merge
2. GitHub에서 pull_request_target.closed 이벤트 발생
3. 워크플로우 실행 조건 확인
   - PR이 실제 merge된 상태인지 확인: merged == true
   - PR의 base branch가 main인지 확인
4. main 브랜치를 checkout
5. GitHub 이벤트 payload에서 문서화에 필요한 PR 정보 추출
   - PR 번호
   - PR 제목
   - PR URL
   - 작성자
   - base/head branch
   - merge 시각
   - PR 본문
6. 추출한 정보를 Markdown 형식으로 변환
7. docs/pull-requests/{PR번호}-{PR제목슬러그}.md 파일 생성
8. 생성된 문서 파일만 스테이징
9. 문서화 커밋 생성
   - 커밋 메시지: docs: PR #번호 PR제목 문서화
10. 생성된 문서화 커밋을 main 브랜치에 push
11. 단, 워크플로우 재실행 등으로 동일한 문서가 이미 존재하고 변경 사항이 없으면 커밋 없이 종료
