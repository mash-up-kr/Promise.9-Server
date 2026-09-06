# PR #110: [fix] Brunch·YouTube 링크 미리보기 수집 오류 수정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/110
- Author: @vcz-Chan
- Base: main
- Head: fix/brunch-og-preview
- Merged: 2026-09-06T03:53:48Z

## PR Body

## 📌 개요
Brunch와 YouTube에서 제목·썸네일 미리보기가 비정상적으로 수집되는 문제를 수정하고, 사이트별 예외 처리를 확장 가능한 전략 구조로 분리합니다.

- Brunch: 브라우저 User-Agent 요청이 Kakao 자동 로그인으로 리다이렉트되어 OG 문서에 도달하지 못함
- YouTube: 서버 환경의 watch 페이지가 OG 메타데이터 대신 봇 확인 응답을 반환해 `title: "- YouTube"`, `thumbnailUrl: null`로 수집됨

## ✅ 작업 내용
- [x] `html` / `oembed`를 구분하는 `LinkContentStrategy` 타입과 registry 추가
- [x] 사이트별 전략을 `strategy/site/`로 분리
- [x] 미등록 도메인은 기존 Chrome User-Agent 기반 HTML/OG 수집 유지
- [x] Brunch 전략에만 `Promise9Bot/1.0` User-Agent 적용
- [x] YouTube 및 youtu.be 전략은 공식 oEmbed로 제목·썸네일 수집
- [x] oEmbed 실패 또는 유효 데이터 부재 시 HTML/OG로 폴백
- [x] robots.txt와 HTML 요청에 동일한 사이트 전략 적용
- [x] 호스트 경계 검증으로 유사 도메인 오인 방지
- [x] 모듈 구성·사이트 추가 방법·폴백 정책을 `content/README.md`에 문서화
- [x] 공용 `describeError` util을 재사용하고 중복 private helper 제거

## 💬 리뷰어에게

### 처리 흐름
- `youtube.com`, `youtu.be` → YouTube strategy → oEmbed → 실패 시 HTML/OG
- `brunch.co.kr` → Brunch strategy → `Promise9Bot/1.0` User-Agent 기반 HTML/OG
- 그 외 → default strategy → 기존 HTML/OG

`LinkContentService`는 특정 사이트를 직접 판별하지 않습니다. registry가 전략을 선택하고, 공통 서비스가 SSRF 검증, robots.txt, 리다이렉트, 응답 크기 제한, 이미지 URL 검증을 담당합니다.

YouTube oEmbed에서는 `title`과 `thumbnail_url`만 반영하며, 제공하지 않는 `description`과 `content`는 `null`로 유지합니다.

### 보안
- 프록시나 IP 우회는 사용하지 않음
- oEmbed 대상은 고정된 `https://www.youtube.com/oembed` 엔드포인트
- 공개 IP 검증, 5초 타임아웃, 1MB 응답 제한 적용
- 썸네일도 공개 HTTP(S) URL 검증과 최대 길이 제한 적용

## 🧪 검증
- 전체 테스트 251개 통과
- ESLint 오류 0개(기존 warning 2개)
- TypeScript 빌드 통과
- 실제 Brunch URL의 제목·썸네일 수집 확인
- 실제 YouTube URL의 oEmbed 제목·썸네일 수집 확인

## 🔗 관련 이슈
없음
