# PR #55: [feature] 폴더 색상, 상세 조회 및 링크 OG 미리보기 API 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/55
- Author: @Choi-JY1107
- Base: main
- Head: feature/folder-color-and-og
- Merged: 2026-07-17T09:00:23Z

## PR Body

## 📌 개요
폴더에 색상을 지정·조회하는 기능과 폴더 상세 조회 API를 추가했습니다.
또한 링크 저장 전 원문의 Open Graph 메타데이터를 조회하는 `GET /links/preview` API를 구현했습니다.

## ✅ 작업 내용 및 변경 사항
- [x] 폴더 색상 기능 (색상 팔레트 + 생성/수정 시 색상 지정)
- [x] 폴더 상세 조회 API (`GET /folders/:folderId`)
- [x] 링크 OG 미리보기 API (`GET /links/preview?url=`) — `title`·`thumbnailUrl`·`source` 반환
- [x] OG fetch에 SSRF 방어·타임아웃·리다이렉트·용량 제한 적용
- [x] preview 실패 유형별 에러코드(`930004`~`930007`) 및 문서 반영

## 💬 리뷰어에게
- OG fetch(`OgFetcherService`)가 기존 `image-fetcher`와 로직이 겹칩니다. 지금은 preview 용도로 별도 구현했는데, 공통 `SecureHttpClient` 추출은 후속으로 논의하면 좋겠습니다.

## 🔗 관련 이슈


## 🔍 상세 내용
- `GET /links/preview`
  1. URL 검증(SSRF)
  2. HTML fetch(리다이렉트 재검증, 5s 타임아웃, 1MB 상한)
  3. 정규식으로 `og:title`/`og:image` 추출
  4. 최종 URL 기준 절대경로화 및 도메인 정리.
- `title`은 `og:title`→`<title>`, `thumbnailUrl`은 `og:image`→`twitter:image` 순으로 폴백하며 없으면 `null`.
- 실패는 원인별로 구분: 네트워크 실패(`930004`), 타임아웃(`930005`), 원문 비정상 응답(`930006`, 실제 상태 코드 포함), 리다이렉트 실패(`930007`).
