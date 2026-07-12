# PR #33: [feature] 이미지 URL 다운로드 서비스 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/33
- Author: @vcz-Chan
- Base: main
- Head: feat/image-fetcher
- Merged: 2026-07-06T14:22:52Z

## PR Body

## 📌 개요
외부 이미지 URL을 서버에서 안전하게 다운로드하는 `ImageFetcherService`를 추가했습니다.
URL 검증, 리다이렉트 재검증, 응답 크기 제한, 요청 timeout을 한 곳에서 처리합니다.

## ✅ 작업 내용 및 변경 사항
- [x] 이미지 요청 옵션과 기본 제한값 추가
- [x] 이미지 응답의 Content-Type, Content-Length, body 크기 검증 추가
- [x] URL 검증 결과의 IP로 직접 요청하도록 다운로드 로직 추가
- [x] 리다이렉트 URL도 매번 다시 검증
- [x] timeout, maxBytes, maxRedirects 상한 검증 추가
- [x] 응답 body 정리 누락 방지 테스트 추가

## 💬 리뷰어에게
사용자 입력 URL을 서버가 직접 요청하는 흐름이라 보안 경계를 중점적으로 봐주세요.
특히 `UrlSecurityService`가 반환한 IP로 연결하고, 원래 host를 `Host`/SNI에 유지하는 흐름을 확인 부탁드립니다.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
주요 흐름은 다음과 같습니다.

1. 이미지 URL을 파싱합니다.
2. URL의 호스트를 공개 IP로 검증합니다.
3. 검증된 IP로 HTTP 요청을 보냅니다.
4. 리다이렉트가 있으면 다음 URL도 다시 검증합니다.
5. 이미지 응답인지 확인하고, 지정한 크기보다 크면 중단합니다.
6. 최종 이미지 buffer, content-type, byteLength, sourceUrl을 반환합니다.
