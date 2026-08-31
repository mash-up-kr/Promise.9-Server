# PR #107: [fix] environment.spec.ts 픽스처에 KAKAO_NATIVE_APP_KEY 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/107
- Author: @hyoinkang
- Base: main
- Head: fix/environment-spec-kakao-native-app-key
- Merged: 2026-08-31T13:44:01Z

## PR Body

## 📌 개요

`main`의 `validateEnvironment` 관련 테스트가 전부 실패하고 있어, 원인을 찾아 고쳤습니다.

## ✅ 작업 내용 및 변경 사항

- [ ] `environment.spec.ts`에 `KAKAO_NATIVE_APP_KEY` 추가

## 💬 리뷰어에게

**실패 이유**: 환경변수 추가에 따라 `environment.spec.ts`에 명시적으로 반영이 필요한데, `KAKAO_NATIVE_APP_KEY`가 필수 환경변수로 추가되면서 이 스펙 파일의 갱신이 누락되었습니다. 


환경 변수 추가 시 반영되어 하는 사항들은 다음과 같습니다.
- 코드: environment.ts 필수 스키마 추가
- 테스트: developmentEnvironment, productionEnvironment fixture에 가짜 값 추가
- .env.example: 개발자용 항목 추가
- GitHub Secrets: 실제 환경변수 값 등록
- 배포 workflow: secret을 .env.production에 기록하도록 수정
- Notion: 팀의 환경변수 목록이나 온보딩 문서를 관리 중이라면 업데이트
- 로컬 .env: 서버를 직접 실행하는 개발자는 실제 값 추가

## 🔗 관련 이슈

N/A

## 🔍 상세 내용

- 로컬에서 `bun test` 185개 전체 통과 확인
- lint/build 통과
