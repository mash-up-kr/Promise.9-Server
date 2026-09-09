# PR #134: [feature] Behance 링크 콘텐츠 수집 지원

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/134
- Author: @ninaxlee
- Base: main
- Head: feat/behance-link-content-strategy
- Merged: 2026-09-09T15:49:13Z

## PR Body

## 📌 개요

Behance 공개 프로젝트와 `be.net` 공유 링크를 TinyFish로 수집하는 사이트별 전략을 추가합니다.
프로젝트 본문과 자체 이미지만 선택해 일반 HTML 수집의 응답 크기·렌더링 문제를 보완합니다.

## ✅ 작업 내용 및 변경 사항

- [x] Behance `/gallery/{id}/{slug}` 및 `be.net/gallery/...\...` URL 판별·canonical 정규화
- [x] `.project-content-wrap` 범위의 본문과 Behance `/project_modules/` 이미지 선택
- [x] registry, preview/collect, HTML fallback, 유사 도메인 회귀 테스트 추가
- [x] 링크 콘텐츠 README에 지원 범위와 한계 문서화

## 💬 리뷰어에게

URL 경계와 이미지 후보 필터가 과도하거나 부족하지 않은지 확인 부탁드립니다.
로컬에 `TINY_FISH_API_KEY`가 없어 실제 TinyFish 응답 E2E는 미검증이며, 공개 Behance 프로젝트 3건의 HTML/DOM과 공식 oEmbed/embed 응답을 비교해 규칙을 정했습니다.

## 🔗 관련 이슈

관련 이슈 없음

## 🔍 상세 내용

- 정상 preview/collect는 각각 TinyFish 요청 1회입니다.
- TinyFish key가 없으면 기존 HTML 수집으로 폴백합니다.
- 비공개·로그인 필요·성인 콘텐츠 확인 화면과 Behance DOM 변경은 지원을 보장하지 않습니다.
- 검증: Jest 56 suites / 519 tests, build, lint, Prettier 통과
