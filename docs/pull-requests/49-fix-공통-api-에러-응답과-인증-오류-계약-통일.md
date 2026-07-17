# PR #49: [fix] 공통 API 에러 응답과 인증 오류 계약 통일

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/49
- Author: @vcz-Chan
- Base: main
- Head: fix/common-error-contract
- Merged: 2026-07-17T02:07:44Z

## PR Body

## 📌 개요

실제 공통 응답 형식과 Swagger 계약을 일치시키고, 기본 HttpException 및 JWT 인증 실패 응답을 도메인 에러 형식으로 통일했습니다.
Auth와 User Endpoint의 요청·응답·에러 예시도 실제 동작 기준으로 보강했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `COMMON_ERROR` 상수 구조와 공통 errorCode 분류 규칙 통일
- [x] `CommonResponse.success` 및 Swagger required 필드 추가
- [x] 공통 에러 Swagger DTO와 Endpoint별 에러 예시 추가
- [x] JWT 인증 실패를 `AUTH_ERROR.INVALID_TOKEN`으로 통일
- [x] Auth/User Swagger body 설명, 예시, date-time 형식 보강
- [x] 공통 에러 코드 정책 문서 갱신

## 💬 리뷰어에게

이 PR은 링크·폴더 API 계약 스택의 첫 번째 PR입니다.
공통 에러 정의와 실제 Endpoint별 Swagger errorCode가 일치하는지 중점적으로 확인 부탁드립니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- 성공 응답은 `{ success: true, data }`를 공통 응답 형식로 사용하며 OpenAPI에서도 `success`와 `data`를 필수 필드로 선언했습니다.
- 에러 응답은 `{ success: false, error: { code, errorCode, message, timestamp } }`로 통일하고 `errorCode`를 숫자 타입으로 문서화했습니다.
- 명시적인 도메인 errorCode가 없는 `400 Bad Request`는 validation 오류 `910001`, 그 외 기본 `HttpException`은 공통 오류 `910002`로 분류합니다.
- JWT Guard의 토큰 없음·검증 실패는 Passport 기본 응답 대신 `AUTH_ERROR.INVALID_TOKEN`을 반환합니다.
- Swagger에는 HTTP status별 공통 예시가 아니라 각 Endpoint에서 실제 발생 가능한 도메인 errorCode를 표시합니다.
