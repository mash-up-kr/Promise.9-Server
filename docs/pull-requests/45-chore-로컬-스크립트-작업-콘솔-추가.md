# PR #45: [chore] 로컬 스크립트 작업 콘솔 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/45
- Author: @vcz-Chan
- Base: main
- Head: chore/script-ui
- Merged: 2026-07-17T02:04:35Z

## PR Body

## 📌 개요

로컬 운영 및 검증 스크립트를 브라우저에서 실행하고 로그와 프로세스를 관리할 수 있는 작업 콘솔을 추가했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] 로컬 스크립트 작업 콘솔 추가
- [x] Lint와 Test 범위 실행 지원
- [x] Swagger와 Drizzle Studio 실행 및 자동 열기
- [x] 위험 작업과 장기 실행 프로세스 보호

## 💬 리뷰어에게

# 그냥 자기만족입니다 slop일 수도 있어요.... 코어 로직 아니니깐 봐줘요

스크립트가 많아져서 ui를 만들었어요
사실 그냥 심심해서 만들었어요
린트나 테스트도 범위로 실행할 수 있어요. 생각해보니 어차피 요즘은 ai가 해서 괜히 한 것 같기도 하고요...

## 🔗 관련 이슈
없음

## 🔍 상세 내용

### 실행 방법

```bash
bun run ui
```

### 스크린샷
<img width="1470" height="761" alt="image" src="https://github.com/user-attachments/assets/d163cbcf-7056-47a6-a69b-a6265e623bb5" />


### 검증

애플리케이션 코드 검증 작업을 실행합니다.

- `Lint`: 전체, 현재 워크트리 변경분, 선택한 폴더 범위 실행
- `Unit Test`: 전체, 변경 파일 관련 테스트, 선택한 폴더 하위 테스트 실행
- `Build`: 전체 NestJS production build 실행

기본 실행 버튼은 전체 범위를 대상으로 합니다. 범위 설정에서는 staged, unstaged, untracked 파일을 합친 변경분이나 폴더 단위 범위를 선택할 수 있습니다.

### db 조회

DB 데이터를 변경하지 않는 조회 작업을 실행합니다.

- 개발/운영 DB 전체 백업
- 개발/운영 DB 테이블 구조 Mermaid 생성

운영 작업은 실행 전에 확인 문구를 입력해야 합니다.

### 스키마 관리

DB 스키마를 변경할 수 있는 작업을 실행합니다.

- Drizzle migration 파일 생성
- 개발/운영 DB pending migration 적용
- 개발/운영 DB push 명령 확인

`db:push`는 Drizzle의 대화형 데이터 손실 확인이 필요하므로 GUI 실행을 막고 터미널 전용으로 표시합니다.

### 개발 도구

로컬 개발 도구를 실행하고 준비가 완료되면 브라우저에서 자동으로 엽니다.

- 개발 Swagger: `127.0.0.1:30001`
- 개발 Drizzle Studio: `127.0.0.1:49831`
- 운영 Drizzle Studio: `127.0.0.1:49832`

Swagger는 별도 확인 없이 실행됩니다. Drizzle Studio는 데이터를 수정할 수 있어 실행 전에 확인 문구를 입력해야 합니다.

같은 개발 도구가 이미 실행 중이면 중복 실행을 차단합니다. UI 종료 시 실행 중인 개발 도구 프로세스도 함께 종료합니다.

### 공통 동작

- UI 서버는 로컬 주소에서만 실행
- DEV/PROD 환경 전환
- 전체 작업 검색 후 환경·위험도 필터 적용
- 작업별 실시간 로그와 터미널 탭 제공
- 선택 작업 또는 전체 작업 중지
- 저장소 외부 범위 실행 차단

### 검증 결과

- Lint, Build, TypeScript 검사 통과
- Jest 35개 통과
- Swagger 중복 실행 차단 확인
- UI 종료 후 자식 프로세스 종료 확인
- 저장소 외부 범위 요청 차단 확인
