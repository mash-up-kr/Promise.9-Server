# PR #137: [feature] 무신사·쿠팡 상품 링크 콘텐츠 수집 지원

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/137
- Author: @ninaxlee
- Base: main
- Head: feat/musinsa-coupang-link-content-strategies
- Merged: 2026-09-10T14:41:20Z

## PR Body

## 📌 개요

무신사와 쿠팡의 공개 상품 링크를 TinyFish 사이트별 전략으로 수집합니다.
상품 자체 이미지 후보만 선택하고, 쿠팡 공식 공유 링크도 안전하게 해석합니다.

## ✅ 작업 내용 및 변경 사항

- [x] 무신사 `/products/{id}`, 기존 `/app/goods/{id}` canonical 정규화
- [x] 무신사 상품 ID 기반 `image.msscdn.net` 대표 이미지 선택
- [x] 쿠팡 `/vp/products/{id}`, 모바일 `/vm/products/{id}` canonical 정규화
- [x] 쿠팡 옵션 식별자 `itemId`, `vendorItemId` 유지 및 추적 쿼리 제거
- [x] `link.coupang.com/a/...`, `/re/AFFSDP` 공유 링크의 리다이렉트·SSRF 검증
- [x] registry, preview/collect, 유사 도메인, 이미지 오선택 회귀 테스트와 README 추가

## 💬 리뷰어에게

무신사는 공개 상품 HTML에서 `#commonLayoutContents`, OG 메타데이터와 상품 ID가 포함된 이미지 경로를 확인했습니다.
쿠팡은 서버 요청이 403으로 차단되어 검증하지 못한 DOM selector는 적용하지 않았습니다. 로컬 개발 서버에서는 TinyFish가 비활성화되어 직접 HTML 폴백 후 빈 결과가 나는 것을 확인했으며, TinyFish가 설정된 개발 배포 환경에서 실제 응답 확인이 필요합니다.

## 🔗 관련 이슈

관련 이슈 없음

## 🔍 상세 내용

- 정상 preview/collect는 각각 TinyFish 요청 1회입니다.
- 쿠팡 공유 링크 해석 요청은 별도 1회이며 각 리다이렉트 목적지를 공개 URL로 검증합니다.
- 무신사 검색·카테고리와 쿠팡 비상품 경로는 기존 HTML 전략을 유지합니다.
- 상품 삭제·성인 인증·로그인 필요 화면과 DOM 변경은 지원을 보장하지 않습니다.
- 검증: 관련 Jest 76 tests, 전체 Jest 59 suites / 562 tests, build, lint, Prettier 통과
