# PR #99: [fix] Kakao 네이티브 앱 로그인 id_token audience 불일치 수정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/99
- Author: @hyoinkang
- Base: main
- Head: fix/kakao-native-app-key-audience
- Merged: 2026-08-31T12:57:33Z

## PR Body

## 📌 개요

iOS 테스트 중 카카오 로그인이 웹에서는 성공, 앱에서는 실패하는 현상을 발견하였고, 앱 키와 웹 키가 달라 불일치하는 문제를 수정함.

## ✅ 작업 내용 및 변경 사항

- [ ] `KAKAO_NATIVE_APP_KEY` 환경변수 추가
- [ ] REST API 키(`KAKAO_CLIENT_ID`)와 네이티브 앱 키를 모두 audience로 허용하도록 수정 (배열, OR 매칭)

## 💬 리뷰어에게
N/A


## 🔗 관련 이슈

N/A

## 🔍 상세 내용

- 원인: Kakao 공식 문서 기준 `id_token`의 `aud`는 "발급 시 `client_id`로 전달한 앱 키" 그대로입니다. 웹은 서버가 REST API 키로 code→token 교환을 하니 `aud=REST API 키`, 네이티브 앱은 SDK가 내부적으로 네이티브 앱 키를 써서 `aud=네이티브 앱 키`가 됩니다. 기존 코드는 REST API 키 하나만 허용해서 네이티브 로그인이 항상 막혀 있었습니다.
- Kakao Developers 공식 REST API 문서 확인: `"aud": "ID 토큰이 발급된 앱의 앱 키"`(authorization code 요청 시 `client_id`로 전달한 값)
