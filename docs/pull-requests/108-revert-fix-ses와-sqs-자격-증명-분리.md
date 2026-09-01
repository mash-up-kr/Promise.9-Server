# PR #108: Revert "fix: SES와 SQS 자격 증명 분리"

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/108
- Author: @Choi-JY1107
- Base: main
- Head: revert-pr84-ses
- Merged: 2026-08-31T18:26:25Z

## PR Body

This reverts commit 52c1b8da5dd3b9c2d260ae66077fc8630f692c67.

## 📌 개요
PR 84에서 추가된 SES 전용 자격 증명 강제 검증을 되돌립니다.

## ✅ 작업 내용 및 변경 사항

- [x] EMAIL_SES_ACCESS_KEY_ID, EMAIL_SES_SECRET_ACCESS_KEY 필수 검증 제거
- [x] SES와 SQS 자격 증명 분리 변경 revert
- [x] 기존 AWS 자격 증명 기반 설정으로 앱이 시작되도록 복구

## 💬 리뷰어에게
현재 운영 환경에 SES 전용 Secret이 없어 API 컨테이너가 재시작되는 문제를 해결하기 위한 revert입니다.
SES 이메일 기능 자체는 기존 로직을 유지합니다.

## 🔗 관련 이슈
PR #84

## 🔍 상세 내용
PR 84의 52c1b8d 커밋을 revert했습니다.
테스트 221개 통과 및 lint 검증을 완료했습니다.
