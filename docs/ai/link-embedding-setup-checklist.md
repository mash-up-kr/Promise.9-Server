# 링크 임베딩 검색 — 내가 할 일 체크리스트

임베딩 검색 코드는 반영 완료됐다. 로컬에서 돌리기 위해 아래 순서대로 실행한다.
검색 점수 산정 방식은 [링크 검색 점수 산정](./link-search-scoring.md)을 참고한다.

<br>

## 0. Docker PATH 설정 (한 번만)

Docker 크리덴셜 헬퍼가 PATH에 없으면 이미지 pull이 실패한다. 먼저 PATH에 추가한다.

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# 매번 하기 싫으면 영구 적용
echo 'export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

<br>

## 1. OpenAI API 키 발급 → `.env`

- [platform.openai.com](https://platform.openai.com) → **API keys** → **Create new secret key**
- 복사해서 `.env`에 추가:

```dotenv
OPENAI_API_KEY=발급받은_키
```

<br>

## 2. 로컬 도커를 pgvector 이미지로 재생성

기본 `postgres` 이미지엔 pgvector가 없어 마이그레이션이 실패한다. `pgvector/pgvector:pg18`로 띄운다.

```bash
docker stop promise9-db && docker rm promise9-db
docker run -d --name promise9-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=promise9 \
  -p 5432:5432 pgvector/pgvector:pg18

docker ps   # promise9-db가 Up 상태인지 확인
```

<br>

## 3. (선택) 운영 데이터 로컬로 가져오기

실제 데이터로 검색을 테스트하려면 [prod→local 런북](../database/prod-to-local-runbook.md)의 "실행" 블록을 따른다.
**2번에서 이미 pgvector 이미지로 만들었으므로 런북의 컨테이너 재생성 단계는 건너뛰고** dump→restore만 한다.

<br>

## 4. `.env`를 로컬 DB로 전환

`DATABASE_URL_DEVELOPMENT`가 원격 운영을 가리키면 마이그레이션이 운영에 적용된다. 로컬로 바꾼다.

```dotenv
APP_ENV=development
DATABASE_URL_DEVELOPMENT=postgres://postgres:postgres@localhost:5432/promise9
```

<br>

## 5. 마이그레이션 + 임베딩 생성

```bash
bun run db:migrate              # 벡터 컬럼 + HNSW 인덱스 + CREATE EXTENSION vector
bun run db:backfill:embeddings  # 기존 링크 임베딩 생성 (OpenAI 호출)
```

<br>

## 6. 검색 확인

```bash
bun run start:dev
# 다른 터미널에서
curl "http://localhost:3000/api/v1/links?q=검색어"   # 하이브리드(벡터+키워드) 검색
```

<br>

## 트러블슈팅

| 증상 | 해결 |
| --- | --- |
| `docker-credential-osxkeychain ... not found` | 0번 PATH 설정 |
| `Unable to find image` / pull 실패 | 0번 PATH 설정 후 재시도 |
| 마이그레이션 `type "vector" does not exist` | 2번에서 pgvector 이미지로 재생성했는지 확인 |
| 검색 시 벡터 결과 없음 | `OPENAI_API_KEY` 설정 + 5번 backfill 실행 여부 확인 |
| 운영 DB에 마이그레이션 적용됨(사고) | 4번에서 `.env`를 로컬로 바꿨는지 먼저 확인 |
