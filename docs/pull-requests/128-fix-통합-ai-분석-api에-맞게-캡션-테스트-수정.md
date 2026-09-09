# PR #128: [fix] 통합 AI 분석 API에 맞게 캡션 테스트 수정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/128
- Author: @vcz-Chan
- Base: main
- Head: fix/link-analysis-test-api
- Merged: 2026-09-09T12:31:45Z

## PR Body

## 📌 개요

AI 요약·태그 생성이 `generateLinkAnalysis`로 통합된 후 캡션 테스트에 남은 이전 메서드 참조로 인해 발생한 TS2339 오류를 수정합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `generateSummary`, `generateTags` 호출 검증을 `generateLinkAnalysis` 입력값 검증으로 변경
- [x] 요약과 태그 생성 시 통합 AI 호출이 1회만 발생하는지 검증

## 💬 리뷰어에게

테스트 파일의 검증 두 줄만 변경했습니다. 서비스 구현 변경은 없습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- 최신 `origin/main` (`4aa816e`) 기반
- `bun run test -- --runInBand`: 54개 스위트, 449개 테스트 통과
- `bun run lint`: 오류 0개, 기존 경고 2개
- `bun run build`: 통과
