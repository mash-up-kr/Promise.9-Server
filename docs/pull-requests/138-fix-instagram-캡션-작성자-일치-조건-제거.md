# PR #138: [fix] Instagram 캡션 작성자 일치 조건 제거

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/138
- Author: @vcz-Chan
- Base: main
- Head: fix/instagram-caption-author-boundary
- Merged: 2026-09-11T18:04:12Z

## PR Body

## 📌 개요
Instagram 게시물 `DdEfm89GVKh`에서 캡션이 수집됐는데도 상단 작성자 표시와 캡션 작성자가 다르다는 이유로 제목·설명이 null이 되는 문제를 수정합니다. 작성자 값 비교를 제거하고 좋아요 다음 계정명과 댓글 입력 영역으로 캡션 경계를 식별합니다.

## ✅ 작업 내용 및 변경 사항
- [x] 상단 작성자 형식 및 캡션 작성자와의 일치 조건 제거
- [x] 공동 작성자 표시, 다른 표시 이름, 인증 배지와 잘못된 캡션 경계 회귀 테스트 추가
- [x] README에 캡션 경계 식별 정책 명시

## 💬 리뷰어에게
실제 응답의 상단은 `travel_bonyoandlif_e_scape`, 캡션 작성자는 `travel_bonyo`였습니다. 특정 공동 작성자 문자열에 예외를 추가하지 않고 불필요한 비교 자체를 제거했습니다. 좋아요·계정명·댓글 입력 영역의 경계 검증은 유지합니다.

## 🔗 관련 이슈
별도 이슈 없음. 재현 게시물: https://www.instagram.com/p/DdEfm89GVKh/

## 🔍 상세 내용
실제로 수집한 TinyFish 응답을 수정된 전략에 재입력하여 캡션 298자, 첫 줄 제목, 해시태그 보존 및 UI 문구 제외를 확인했습니다. 수집 URL·요청 수·이미지 선택·저장 정책은 변경하지 않습니다. Instagram의 다른 언어·응답 구조까지 일반화한 검증은 아닙니다.

- Node v24에서 콘텐츠 모듈 Jest 18 suites / 313 tests 통과
- TypeScript 빌드, 변경 TypeScript 파일 ESLint, `git diff --check` 통과
- 별도 작업 트리에서 Bun으로 Jest 실행 시 런타임 초기화 오류가 발생해 기존 Node 런타임으로 검증했습니다.
