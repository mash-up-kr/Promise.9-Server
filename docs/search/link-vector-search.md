# 벡터 검색 구조

링크 의미 검색을 위해 Postgres에 pgvector를 도입하고 `links.embedding` 컬럼에 임베딩을 저장한다.
점수 공식은 [검색 점수 산정](./link-search-scoring.md)에 있다.

<br>

## pgvector 확장

벡터 타입과 거리 연산자는 Postgres 기본 기능이 아니라 pgvector 확장이 제공한다.
마이그레이션 `0005`에서 확장을 켜고 컬럼을 추가한다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "links" ADD COLUMN "embedding" vector(768);
```

확장이 없는 Postgres에서는 이 마이그레이션이 `type "vector" does not exist`로 실패한다.
로컬은 `pgvector/pgvector:pg18` 이미지처럼 확장이 포함된 이미지를 써야 한다. (DB 준비는 [database/setup.md](../database/setup.md) 참조)

<br>

## 임베딩 컬럼

| 항목      | 값                                                    |
| --------- | ----------------------------------------------------- |
| 컬럼      | `links.embedding` — `vector(768)`, 미생성 시 `null`   |
| 모델      | OpenAI `text-embedding-3-large` (`EMBEDDING_MODEL`)   |
| 차원      | `768` (`EMBEDDING_DIMENSIONS`)                        |

모델과 차원은 `src/common/constants/llm.ts`에 상수로 고정한다. env로 열어두지 않는 이유는 provider·모델을 바꾸면 기존 벡터와 호환되지 않아 전량 재생성해야 하기 때문이다. `vector(N)`의 `N`도 이 상수와 반드시 일치해야 한다.

`text-embedding-3-large`는 원래 3072차원이지만 `dimensions` 파라미터로 축소를 네이티브 지원하고, 축소 결과도 정규화해서 돌려준다. 그래서 768차원을 쓰면서도 별도 정규화가 필요 없다. 3-small 대신 3-large를 쓰는 건 한국어 의미 검색 품질 때문이다.

<br>

## 임베딩 대상 텍스트

`buildEmbeddingText`(`link.util.ts`)가 아래를 줄바꿈으로 이어 하나의 텍스트로 만든다. 빈 값은 제외한다.

```
title
tags (sortOrder 순)
aiSummary
```

생성 시점은 요약·태그 처리가 끝난 뒤다.

- **요약·태그 처리 후** — 두 작업의 성공 여부와 관계없이 최신 DB 값을 다시 읽어 가능한 부분 결과로 임베딩을 시도한다.
- **전체 상태 확정 전** — 요약·태그 처리와 임베딩 저장이 모두 성공해야 `processingStatus=SUCCESS`로 변경한다. 하나라도 실패하면 부분 결과는 보존하고 `FAILED`로 기록한다.

기존 링크는 `bun run db:backfill:embeddings`로 채우며, 실행 전에 사용자 범위와 예상 API 호출 수를 확인한다.

`LinkRepository.updateEmbedding`은 요청 사용자의 활성 링크에만 벡터를 저장한다. 임베딩 생성 중 링크가 삭제돼 갱신된 행이 없으면 임베딩 실패로 처리한다.

<br>

## 코사인 유사도 계산

pgvector의 `<=>` 연산자가 코사인 **거리**를 준다. 유사도는 거리를 1에서 뺀 값이다.

```
코사인 거리   = embedding <=> :queryEmbedding     -- 0(동일) ~ 2(정반대)
코사인 유사도 = 1 - (embedding <=> :queryEmbedding)  -- 1에 가까울수록 유사
```

`findVectorCandidates`(`link.repository.ts`)가 이 계산을 담당한다. drizzle의 `cosineDistance()`가 `<=>`로 컴파일된다.

```
SELECT id, 1 - (embedding <=> :query) AS score
FROM links
WHERE user_id = :userId
  AND deleted_at IS NULL          -- deleted=true면 IS NOT NULL
  AND embedding IS NOT NULL       -- 임베딩 미생성 링크는 벡터 후보에서 제외
  -- 아래는 요청 필터에 따라 붙는다 (buildScopeConditions)
  [AND folder_id = :folderId]     -- folderId
  [AND folder_id IS NULL]         -- unassigned=true
  [AND is_favorite = true]        -- favorite=true
  [AND viewed_at IS NOT NULL]     -- sortBy=viewedAt
ORDER BY embedding <=> :query
LIMIT 50                          -- LINK_SEARCH_CANDIDATE_LIMIT
```

정렬은 `score DESC`가 아니라 `거리 ASC`로 한다. 결과 순서는 같지만 거리 계산을 한 번만 하고, 나중에 벡터 인덱스를 도입하면 인덱스가 쓸 수 있는 형태이기도 하다.

<br>

## 벡터 인덱스를 걸지 않는 이유

`embedding`에는 **HNSW 같은 벡터 인덱스를 걸지 않는다.** 필터를 통과한 행만 정확히(exact) 스캔한다.

HNSW는 근사 최근접(ANN) 인덱스로, 벡터를 다층 그래프로 연결해두고 일부만 탐색해 "가까울 것 같은" 후보를 빠르게 뽑는다. 문제는 **pgvector가 `(user_id, embedding)` 같은 복합 벡터 인덱스를 지원하지 않는다**는 점이다. 인덱스는 `embedding` 단일 컬럼에만 걸리므로 플래너가 이 인덱스를 쓰면 순서가 이렇게 된다.

1. 전체 `links`에서 쿼리 벡터에 가까운 후보를 `hnsw.ef_search`(기본 40)개 뽑는다 — **사용자 구분 없이**
2. 그 후보에 `user_id`·`deleted_at`·폴더 필터를 적용한다
3. 남은 것만 반환한다

한 사용자의 링크가 전체의 일부라면 후보 대부분이 2단계에서 걸러진다. 의미상 딱 맞는 링크를 갖고 있어도 결과가 `limit`보다 훨씬 적거나 비어서 나온다. 게다가 플래너가 HNSW를 쓸지 btree(`links_user_id_created_at_idx`)로 갈지에 따라 결과가 달라져 recall이 데이터 분포에 따라 흔들린다.

인덱스를 걸지 않으면 비용은 **필터를 통과한 행 수**에만 비례한다. 그 필터는 이미 인덱싱돼 있어서, 사용자 한 명의 링크 수가 곧 코사인 계산 횟수다. 정확도는 100%다.

| | 인덱스 있음 | 없음 (현재) |
| --- | --- | --- |
| 정확도 | 근사 + 필터에 후보가 걸려 누락 | recall 100% |
| 예측성 | 플래너 선택에 따라 결과가 달라짐 | 항상 동일 |
| 속도 | 사용자당 링크가 많아질수록 유리 | 필터 통과 행 수에 비례 |
| 쓰기 비용 | 임베딩 갱신마다 그래프 삽입 | 없음 |
| 저장 공간 | 벡터당 3KB(768 × 4바이트) + 그래프 | 없음 |

**재도입 기준:** 사용자당 활성 링크가 만 건대에 접근하면 다시 검토한다. 그때는 pgvector 0.8.0+의 `hnsw.iterative_scan`(필터 통과분이 부족하면 인덱스를 더 훑는 옵션)을 함께 켜야 위 후보 누락이 재발하지 않는다.
