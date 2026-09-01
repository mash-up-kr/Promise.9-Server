# PR #109: [feature] 링크 중복 저장 409 응답에 기존 링크 ID 포함

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/109
- Author: @hyoinkang
- Base: main
- Head: feature/duplicate-link-response-linkid
- Merged: 2026-09-01T11:23:56Z

## PR Body

## 📌 개요

프론트 측 요청에 따라 링크 저장 시 중복이면 저장된 기존 링크의 id를 응답에 함께 반환하는 방식으로 수정했습니다. 겸사겸사 관련 문서도 함께 갱신했습니다.

## ✅ 작업 내용 및 변경 사항

- [ ] `BaseException`에 범용 `data` 필드 추가
- [ ] 링크 중복 저장 409 응답의 `error.linkId`에 기존 링크 ID 포함
- [ ] Swagger에 필드·예시 반영
- [ ] `docs/api/link.md`에 누락돼 있던 409 응답 명세 추가
- [ ] 테스트 2개 추가

## 💬 리뷰어에게

N/A

## 🔗 관련 이슈

N/A

## 🔍 상세 내용

- 검증 완료
  - lint 통과
  - TypeScript 빌드 통과
  - 테스트 223개 통과
