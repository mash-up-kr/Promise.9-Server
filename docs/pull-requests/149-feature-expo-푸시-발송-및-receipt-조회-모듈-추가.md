# PR #149: [feature] Expo 푸시 발송 및 receipt 조회 모듈 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/149
- Author: @ninaxlee
- Base: main
- Head: feature/expo-push
- Merged: 2026-11-23T13:31:13Z

## PR Body

## 📌 개요

모바일 푸시 알림을 발송하고 전달 결과를 확인할 수 있도록 `expo-server-sdk` 기반의 `PushModule`을 추가합니다. 호출하는 서비스에서 메시지와 수신 토큰을 전달하면 토큰별 접수 결과와 ticket별 receipt 조회 결과를 받을 수 있습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `PushService.send()` 구현: 토큰 형식 검증, SDK 제한에 따른 요청 분할, 입력 순서대로 토큰별 결과 반환
- [x] `PushService.getReceipts()` 구현: 중복 ticket ID 제거, 요청 분할, 전달 결과 조회
- [x] 생성자에서 Expo 클라이언트를 한 번 생성하고 발송·조회 함수에서 재사용
- [x] `chunks` 생성과 반복문을 분리하고 함수별 설명 주석 추가
- [x] `EXPO_ACCESS_TOKEN` 환경변수 검증, 배포 시 secret 전달, 사용 문서 추가
- [x] 잘못된 토큰, 부분 실패, ticket 대응 관계, receipt 미조회·요청 실패 테스트 추가

## 💬 리뷰어에게

발송 결과가 원래 입력의 순서·개수를 유지하는지, 요청 실패와 명시적인 거절을 구분해 후속 처리할 수 있는지 확인 부탁드립니다.

알림 대상 선정과 배치 실행은 별도 작업에서 담당합니다. 사용자별 푸시 토큰 등록·해제 API와 저장소 연결은 #154에서 구현합니다.

## 🔗 관련 이슈

연결된 이슈 없음.

## 🔍 상세 내용

### 발송과 결과 조회

`send()`는 메시지 하나에 수신 토큰 하나를 받으며, 한 요청 묶음이 실패해도 다음 묶음을 처리합니다.

- `accepted`: Expo가 접수했으며 `ticketId`를 반환합니다. 기기 수신을 의미하지 않습니다.
- `rejected`: 토큰 형식이 잘못됐거나 Expo가 메시지를 명시적으로 거절했습니다.
- `unknown`: 요청 실패로 접수 여부를 확정할 수 없습니다. 재시도하면 중복 발송될 수 있습니다.

`getReceipts()`는 ticket ID별로 `ok`, `error`, `pending`, `unknown`을 반환합니다. 응답에 없는 ID는 `pending`, 조회 요청 자체가 실패한 경우는 `unknown`으로 구분합니다. `ok`는 APNs·FCM 접수를 의미하며 기기 수신을 보장하지 않습니다.

공급자 오류 메시지와 debug 정보는 반환하거나 로그로 남기지 않고, 후속 처리에 필요한 오류 코드를 반환합니다. 반환값의 토큰과 ticket ID는 호출 측에서 사용자·작업 정보와 연결해 관리합니다.

### 설정

Expo 프로젝트에서 Enhanced push security를 사용하는 경우 `EXPO_ACCESS_TOKEN`을 설정합니다. 운영 배포에서는 같은 이름의 GitHub Actions secret을 설정하면 `.env.production`으로 전달됩니다.

사용 예시와 배치 연동 시 주의할 점은 `docs/infrastructure/push.md`에 정리했습니다.

### 검증

- TypeScript 빌드 및 ESLint 통과
- 최신 main 반영 후 전체 테스트 75개 스위트, 774개 통과
- 최신 main(`ef1c634`) 반영 후 GitHub Actions CI 통과
