# PR #139: [feature] 네이버 블로그 게시물 링크 콘텐츠 수집 지원

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/139
- Author: @hyoinkang
- Base: main
- Head: feat/naver-blog-link-content-strategy
- Merged: 2026-09-12T02:18:45Z

## PR Body

## 📌 개요

네이버 블로그 게시물 링크를 TinyFish 사이트별 전략으로 수집합니다.
PC 경로는 본문을 iframe으로만 제공해 OG 태그조차 없으므로 같은 게시물의 모바일 경로로 정규화한 뒤 한 번 요청합니다.
구버전 에디터 게시물까지 같은 선택자로 본문을 수집하고, 게시물 자체 사진만 대표 이미지로 사용합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `blog.naver.com`, `m.blog.naver.com`의 `/{blogId}/{logNo}` 게시물을 모바일 canonical URL로 정규화
- [x] 구버전 `PostView.naver`·`PostView.nhn` 쿼리 링크도 같은 경로 규칙으로 검증해 동일 URL로 정규화
- [x] 본문 범위를 `.post_ct`로 제한해 스마트에디터 ONE과 구버전 에디터 게시물을 함께 수집
- [x] 대표 이미지는 `mblogthumb-phinf.pstatic.net` 본문 사진만 사용하고 지연 로딩 placeholder(`type=w80_blur`) 제외
- [x] 프로필(`blogpfthumb`), 외부 링크 카드 썸네일(`dthumb`), 블로그 UI 아이콘 제외
- [x] registry 선택, URL 정규화, 유사 도메인·비게시물 경로, 이미지 오선택 회귀 테스트와 README 추가

## 💬 리뷰어에게

선택자와 이미지 규칙은 실제 TinyFish 응답으로 확인했습니다.

- 신버전(`smartEditorVersion: 4`, 2024년 글): 200, 814ms, 본문 2,819자, 대표 이미지 `?type=w800`
- 구버전(`smartEditorVersion: 1`, 2009년 글): 200, 본문·대표 이미지 정상, 같은 `mblogthumb-phinf` CDN

이미지 후보 첫 번째가 같은 사진의 흐린 지연 로딩 placeholder(`type=w80_blur`)로 오는 것을 실제 응답에서 확인해 제외 조건을 추가했습니다. 후보가 placeholder뿐이면 `null`을 반환합니다.

## 🔗 관련 이슈

관련 이슈 없음

## 🔍 상세 내용

- 정상 preview/collect는 각각 TinyFish 요청 1회입니다.
- `naver.me` 공유 링크는 기존 단축 URL 해석을 거쳐 최종 URL로 이 전략을 선택합니다.
- 블로그 홈·목록·댓글 경로와 유사 hostname은 기존 HTML 전략을 유지합니다.
- TinyFish 키가 없으면 기존 HTML 경로를 사용하며, 이때 PC 경로는 iframe 껍데기라 결과가 비어 있을 수 있습니다.
- 비공개·삭제 게시물과 DOM 변경은 지원을 보장하지 않습니다.
- 검증: 관련 Jest 19 suites / 323 tests, 전체 Jest 61 suites / 581 tests, build, lint 통과
