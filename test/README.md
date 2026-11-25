# PostgreSQL 통합 테스트

UTM 동시 갱신 테스트는 실제 `UserRepository`와 PostgreSQL 행 잠금을 사용합니다. 두 요청을 겹쳐 실행해 최초 접점 보존, 최신 접점 갱신, 과거·동일 시각 요청의 무변경 처리를 검증합니다.

알림 스키마 테스트는 UNIQUE·CHECK·복합 FK, 이메일·푸시 이력과 링크의 소유자 일치, 토큰 삭제와 독립적인 이력 보존, 링크·사용자 영구 삭제 시 동작을 검증합니다. `0018`이 기존 푸시 이력을 보존하면서 토큰 참조를 제거하고 이메일 이력의 소유자를 보강하는지도 확인합니다.

알림 수신 설정 테스트는 미설정 회원의 기본값(모두 켜짐), 채널별 부분 변경과 중복 없는 upsert, 탈퇴 회원 거부, 리마인드 대상 조회가 발송 시점의 이메일 설정을 따르고 설정 변경이 리마인드 일정을 바꾸지 않는지를 검증합니다.

리마인드 배치 테스트는 회차 생성, 수신 설정·지금 소유자의 기기 기준 대상 조회, 채널·기기별 첫 발송과 재시도 선점이 한 번만 성공하는지, 기한·회차 조건, 발송 당시 소유자 기준 토큰 정리를 검증합니다. 실제 저장소로 배치를 겹쳐 실행해도 이메일과 기기마다 한 번만 보내고, 이메일만 실패하면 이메일만 다시 보내는지도 확인합니다.

푸시 토큰 저장소 테스트는 재등록·계정 전환·소유자 범위 삭제·동시 등록·회원 탈퇴 경합과 토큰 해제 시 발송 이력 보존을 실제 PostgreSQL에서 검증합니다.

테스트 전용 PostgreSQL 18에 저장소의 마이그레이션을 적용합니다. `TEST_DATABASE_URL`은 필수이며 DB 이름은 `_test`로 끝나야 합니다. 일반 `DATABASE_URL`과 `.env`는 사용하지 않습니다.

```sh
docker run --detach --rm --name promise9-integration-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=integration \
  -e POSTGRES_DB=promise9_test -p 127.0.0.1:55432:5432 \
  pgvector/pgvector:0.8.6-pg18-bookworm

docker exec promise9-integration-db pg_isready -U postgres -d promise9_test
# accepting connections 확인 후 실행
TEST_DATABASE_URL=postgresql://postgres:integration@127.0.0.1:55432/promise9_test \
  bun run test:integration

docker stop promise9-integration-db
```

테스트가 생성한 사용자와 DB 연결은 실행 후 정리합니다. CI는 같은 PostgreSQL 이미지를 서비스로 실행하고 `bun run test:integration`을 필수 단계로 수행합니다. 기존 단위·HTTP 테스트는 `bun run test -- --runInBand`로 별도 실행합니다.
