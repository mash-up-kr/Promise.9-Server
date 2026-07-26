# PR #57: [refactor]repository 계층 분리 및 관측성 로깅, 마스터 유저 시드 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/57
- Author: @Choi-JY1107
- Base: main
- Head: feature/refactor-repository
- Merged: 2026-07-26T22:27:39Z

## PR Body

## 📌 개요
~~저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....저는 폐급입니다....~~

1. repository 계층 추가
2. HTTP 접근 로그, 예외 로그 개선
3. 로컬(혹은 개발용) 마스터 유저 시드 스크립트를 함께 추가

## ✅ 작업 내용 및 변경 사항
1. repository 계층
- [x] folder, user, auth, ai 모듈의 DB 접근을 `*-Repository` 계층으로 분리 (서비스는 repository만 주입)
- [x] 트랜잭션을 repository 내부에서 완결하도록 정리 (`DbExecutor` 타입 추가로 tx 재사용)
- [x] user 모듈 파일 구조를 `schema/`, `repository/` 서브폴더로 정리

2. 개발용 로그 추가
- [x] 모든 요청의 url, status, 소요시간을 남기는 HTTP 접근 로그 미들웨어 추가
- [x] 예외 로그에 요청 맥락(method·url·status·errorCode·메시지) 보강 및 4xx/5xx 레벨 구분

3. 개발용 데이터 추가
- [x] 마스터 유저 시드 스크립트(`bun run db:seed:master`) 추가

## 💬 리뷰어에게
- 트랜잭션 처리 위치를 **repository 내부**로 잡았습니다. 이러한 구성 형식이 적절한지 봐주세요.

## 🔗 관련 이슈
close #

## 🔍 상세 내용
### 1. Repository 계층 분리
- 서비스가 `DatabaseService`를 직접 참조하던 구조를 제거하고, 각 모듈에 repository를 추가했습니다.
  - `FolderRepository`, `UserRepository`, `SocialAccountRepository`, `RefreshTokenRepository`, `AiMetricRepository`
- `folder.service.ts`에 있던 `remove` 트랜잭션을 `FolderRepository.removeWithLinks`로 이동해 기존 TODO를 해소했습니다.
- `database.service.ts`에 `DbExecutor`(일반 커넥션 | 트랜잭션) 타입을 추가해, repository 메서드가 트랜잭션 안팎 모두에서 재사용되도록 했습니다.
- user 도메인 스키마가 여러 모듈에서 공유되므로, 리포지토리를 UserModule이 provide/export하고 AuthModule이 재사용합니다.

### 2. 로깅 / 관측성
- `httpLoggerMiddleware`를 `app.use()`로 전역 등록해, `res`의 `finish` 이벤트 기준으로 예외·미매칭 요청까지 최종 status를 남깁니다.
  - 예) `LOG [HTTP] GET /api/v1/users/me 200 12ms`
- `GlobalExceptionFilter`가 요청 맥락을 함께 기록하도록 개선했습니다.
  - 예) `DEBUG [GlobalExceptionFilter] GET /api/v1/users/me → 404 (errorCode: xxxx) 사용자를 찾을 수 없습니다`
  - 4xx는 `debug`(스택 제외), 5xx는 `error`(스택 포함)로 구분해 정상 클라이언트 오류의 로그 노이즈를 줄였습니다.

### 3. 마스터 유저 시드 스크립트
- `bun run db:seed:master`로 실행하는 1회성 도구이며, 앱 부팅과는 무관합니다.
- `.env`의 `MASTER_USER_ID`가 있으면 그 id로 유저를 생성/복구하고, 없으면 이메일 기준으로 생성 후 부여된 id를 출력합니다. (멱등)

### 검증
- `tsc` 타입체크 통과
- `jest` 전체 테스트 65개 통과 (ai-metric 스펙은 repository mock으로 갱신)
- `eslint` 통과
