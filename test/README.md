# PostgreSQL 통합 테스트

UTM 동시 갱신 테스트는 실제 `UserRepository`와 PostgreSQL 행 잠금을 사용합니다. 두 요청을 겹쳐 실행해 최초 접점 보존, 최신 접점 갱신, 과거·동일 시각 요청의 무변경 처리를 검증합니다.

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
