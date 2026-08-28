# PR #100: [chore] 랭킹랩 CORS origin 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/100
- Author: @vcz-Chan
- Base: main
- Head: chore/ranking-lab-cors
- Merged: 2026-08-28T18:30:19Z

## PR Body

## 📌 개요

운영 랭킹랩에서 운영 API를 직접 호출할 수 있도록 CORS 허용 origin을 추가합니다.
기존 로컬 및 서비스 웹 origin은 그대로 유지합니다.

## ✅ 작업 내용 및 변경 사항

- [x] 랭킹랩 운영 주소를 CORS allowlist에 추가
- [x] lint 및 TypeScript build 확인

## 💬 리뷰어에게

`https://promise9-ranking-lab.dltmdcks.chatgpt.site` origin 추가 외에는 동작을 변경하지 않았습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

랭킹랩은 브라우저에서 `Authorization` 헤더와 함께 `https://api.link-ding-dong.com`을 직접 호출합니다.
NestJS CORS 설정에 랭킹랩 운영 origin을 추가해 preflight 응답에 `Access-Control-Allow-Origin`이 포함되도록 합니다.
