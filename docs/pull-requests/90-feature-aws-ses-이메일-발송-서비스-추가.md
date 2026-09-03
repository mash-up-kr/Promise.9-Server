# PR #90: [feature] AWS SES 이메일 발송 서비스 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/90
- Author: @ninaxlee
- Base: main
- Head: feature/email-service
- Merged: 2026-08-30T08:17:53Z

## PR Body

## 📌 개요
AWS SES v2를 이용해 리마인드 이메일을 개별 발송할 수 있는 `EmailService`를 추가합니다.
SES 도메인 인증과 발송 권한을 관리하는 CDK 스택 및 환경별 배포 설정을 함께 구성합니다.

## ✅ 작업 내용 및 변경 사항
- [x] SES v2 기반 `EmailService` 및 단위 테스트 추가
- [x] 이메일 환경변수 검증과 전용 예외 코드 추가
- [x] SES 도메인 인증 및 IAM 발송 권한 CDK 스택 추가
- [x] production/stage 배포 워크플로우에 이메일 환경변수 연결
- [x] SES 인프라 구성과 운영 절차 문서화

## 💬 리뷰어에게
- 리마인더 용이라 모든 수신자에게 이메일을 개별 발송하도록 `to`를 단일 주소로 제한했습니다.
- 발신 주소는 현재 `reminder@link-ding-dong.com`을 기준으로 구성했습니다.
- AWS 리소스의 실제 배포는 이 PR에 포함하지 않았습니다.

## 🔍 상세 내용
- `@aws-sdk/client-sesv2`의 `SendEmailCommand`을 사용합니다.
- SES 응답에 `MessageId`가 없거나 SDK 호출이 실패하면 `EMAIL_ERROR.SEND_FAILED` 예외로 변환합니다.
- 커밋 훅 기준 테스트 148개가 모두 통과했습니다.
