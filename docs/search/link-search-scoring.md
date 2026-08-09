# 링크 검색 점수 산정

`GET /links?q=...` 검색의 후보 수집, 점수, 정렬, 페이지네이션 규칙을 정리한다. 벡터 저장과 유사도 계산은 [벡터 검색 구조](./link-vector-search.md)를 참고한다.

## 구조

| 파일                                     | 역할                                            |
| ---------------------------------------- | ----------------------------------------------- |
| `link/search/search.service.ts`          | 신호별 후보 수집, hydrate, 최종 30개 상한, 커서 |
| `link/search/search.repository.ts`       | 제목·태그·본문·벡터 후보 쿼리                   |
| `link/link-similarity.util.ts`           | 공용 문자열·태그·cosine 유사도 계산             |
| `link/search/search-ranking.ts`          | 검색 신호 계산과 `(score DESC, id DESC)` 정렬   |
| `link/search/search-ranking.constant.ts` | 검색 기본 가중치                                |

## 후보 수집

검색어를 NFKC 정규화·소문자화하고 한글·영문·숫자 토큰으로 나눈다. 키워드 후보 조회와 키워드 점수에는 앞의 최대 12개 토큰을 동일하게 사용한다. 다음 네 경로에서 각각 최대 30개를 회수한다.

1. 제목 부분일치
2. 태그 `normalizedName` 부분일치
3. AI 요약·메모·도메인·URL·metadata description 부분일치
4. 전체 검색어의 쿼리 임베딩 코사인 유사도

쿼리 임베딩과 세 keyword 후보 조회는 동시에 시작한다. 임베딩이 먼저 완료되면 keyword 조회 완료를 기다리지 않고 바로 벡터 후보 조회를 시작한다.

키워드 경로는 공백 제거·소문자 표현식에 `LIKE '%token%'`을 적용한다. `pg_trgm` GIN 표현식 인덱스는 제목, 본문, 태그에 각각 존재한다. 1~2자 검색어는 추출할 trigram이 없어 사용자 범위 스캔으로 퇴화할 수 있다.

후보 합집은 최대 120개이지만 최종 운영 검색은 관련도 상위 30개만 노출한다. API `limit`은 기본 9, 최대 30이며 30개 안에서 커서 페이지네이션한다.

`folderId`, `unassigned`, `favorite`, `deleted`는 후보 범위에 적용한다. 검색 정렬은 관련도로 고정되므로 `sortBy`, `order`는 후보를 제한하지 않는다.

## 신호와 기본 가중치

각 신호를 0~1로 만든 뒤 가중 합산한다.

| 신호             | 원점수                                     | 기본 가중치 |
| ---------------- | ------------------------------------------ | ----------: |
| `titleKeyword`   | 검색 토큰 중 제목에 부분일치하는 비율      |        0.35 |
| `tagKeyword`     | 검색 토큰 중 태그에 부분일치하는 비율      |        0.20 |
| `contentKeyword` | 검색 토큰 중 본문 묶음에 부분일치하는 비율 |        0.15 |
| `embedding`      | `clamp(1 - cosineDistance, 0, 1)`          |        0.30 |

```text
score = titleKeyword * 0.35
      + tagKeyword * 0.20
      + contentKeyword * 0.15
      + embedding * 0.30
```

키워드 점수는 후보 검색과 동일하게 공백을 제거한 부분일치를 사용한다. 따라서 `머신러닝`과 `머신 러닝`, `nest`와 `nestjs`는 일치한다.

링크 임베딩이 아직 없어 `embedding=null`이면 이를 비유사도 `0`으로 간주하지 않는다. 해당 후보에서 embedding 가중치 `0.30`만 제외하고 lexical 가중치 합 `0.70`으로 점수를 재정규화한다.

```text
scoreWithoutEmbedding = (titleKeyword * 0.35
                       + tagKeyword * 0.20
                       + contentKeyword * 0.15) / 0.70
```

실제로 계산된 embedding 원점수 `0`은 결측값이 아니므로 기존 가중치에 따라 비유사 신호로 반영한다. 관련 링크도 embedding을 계산할 수 없으면 같은 원칙으로 context 가중치 합 `0.65`를 사용한다.

## 정렬과 커서

모든 후보의 점수를 먼저 소수점 5자리로 반올림한 뒤 `(score DESC, id DESC)`로 다시 정렬하고 상위 30개를 선택한다. 응답 점수와 커서 비교 값이 같은 정밀도와 순서를 사용하므로, 반올림 후 동점이 된 후보도 id 순서대로 다음 페이지에 이어진다.

```text
nextCursor = base64url({ "v": "0.87342", "id": 42 })
```

`totalCount`는 커서와 무관한 상위 검색 결과 크기로 최대 30이다. 일반 목록 커서와 검색 커서는 서로 호환되지 않는다.

## 임베딩 실패 폴백

쿼리 임베딩 호출이 실패하면 경고 로그를 남기고 제목·태그·본문 신호로 검색을 계속한다. 이때 embedding은 결측 신호로 처리해 lexical 가중치 합 `0.70`으로 재정규화하며 커서 형식은 변하지 않는다.

## 관련 링크와의 관계

검색과 관련 링크는 문자열·태그·cosine 유사도 계산만 `link-similarity.util.ts`에서 공유한다. 후보 쿼리는 `SearchRepository`와 `RelatedLinkRepository`, 점수 정책은 각각 `search/`, `related/` 내부에서 독립적으로 관리한다.
