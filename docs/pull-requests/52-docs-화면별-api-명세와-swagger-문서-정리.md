# PR #52: [docs] 화면별 API 명세와 Swagger 문서 정리

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/52
- Author: @vcz-Chan
- Base: main
- Head: docs/api-screen-mapping
- Merged: 2026-07-17T02:33:44Z

## PR Body

## 📌 개요

단일 `api-spec.md`를 공통·인증·사용자·링크·태그·폴더 도메인 문서로 분리했습니다.
전달받은 화면을 저장소에 포함하고 화면별 API 조합, 구현 상태, Swagger 외부 문서 링크와 UI 스타일을 정리했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] API 명세 도메인별 분리
- [x] Endpoint별 구현 상태 O·△·X 문서 추가
- [x] 화면별 API 조합과 참고 이미지 추가
- [x] Swagger Tag 설명 및 GitHub 상세 문서 링크 추가
- [x] 요청 body 필수·선택 필드와 응답 Example 문서화
- [x] Swagger inline code와 schema 설명 UI 스타일 보강

## 💬 리뷰어에게

이 PR은 `feature/folder-list-api-contract`을 base로 하는 마지막 스택 PR입니다.
부모 PR 병합 후 base를 `main`으로 변경해서 병합해야 합니다.

화면과 Endpoint 조합이 프론트 연동 관점에서 충분한지, TODO가 완성된 기능처럼 보이지 않는지 중점적으로 확인 부탁드립니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- `api-spec.md`는 전체 계약의 인덱스로 축소하고 공통 응답, 인증, 사용자, 링크, 태그, 폴더 명세를 도메인별 파일에서 관리하도록 분리했습니다.
- `screen-mapping.md`에는 홈·보관함·검색·링크 상세·카테고리 화면 이미지와 각 영역에서 사용하는 Endpoint 조합을 연결했습니다.
- `implementation-status.md`는 명세·Swagger·Endpoint·로직 상태를 O·△·X로 구분해 계약만 있는 기능과 실제 동작하는 기능을 한눈에 확인할 수 있습니다.
- Swagger Tag마다 역할과 GitHub 상세 문서 링크를 제공하고, 요청 body에는 필수·선택 여부와 `null` 전달 시 동작을 바로 확인할 수 있도록 설명을 추가했습니다.
- 성공·에러 응답과 주요 화면별 응답 Example을 추가하고, Markdown inline code와 schema 설명이 자연스럽게 보이도록 Swagger UI 스타일을 조정했습니다.
