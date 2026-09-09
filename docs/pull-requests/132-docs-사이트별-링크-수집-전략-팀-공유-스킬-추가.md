# PR #132: [docs] 사이트별 링크 수집 전략 팀 공유 스킬 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/132
- Author: @vcz-Chan
- Base: main
- Head: docs/site-preview-strategy-skill
- Merged: 2026-09-09T14:18:50Z

## PR Body

## 요약

사이트별 링크 수집 전략을 팀원이 같은 기준으로 조사·구현할 수 있도록 `site-preview-strategy` 스킬을 추가합니다. 네이버·Instagram·YouTube·X 작업에서 확인한 접근법을 필요한 가이드로 정리했습니다.

## 변경 내용

- 공개 embed·모바일 경로, 직접 HTML·oEmbed·공식 API·TinyFish 선택 기준
- 직접 HTML의 robots 준수와 TinyFish 외부 수집 경로 구분
- 실제 응답·원본 이미지로 규칙을 찾고 과도한 ID·순번·본문 조건을 피하는 방법
- 전략 파일·훅 구현, Registry 등록, 테스트·README 반영 절차와 코드 예시
- YouTube의 목적별 API 사용 예외와 TinyFish 요청 URL·format·캐시에 따른 속도 비교
- `.agents/skills/`에 등록하고 문서 목록·`AGENTS.md`에 연결

사용 예: `$site-preview-strategy 이 사이트의 미리보기를 개선해줘: <공개 URL>`

## 검증

- TinyFish Fetch·YouTube 공식 문서와 현재 main 구조 대조
- 스킬 검증기, YAML 메타데이터, 문서 상대 링크, diff 검사 통과
- 문서·스킬만 변경하며 런타임 코드는 변경하지 않음
