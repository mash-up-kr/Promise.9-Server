# user_links

사용자가 저장한 링크의 URL, 수집 메타데이터, AI 요약, 사용자별 상태를 함께 저장하는 테이블이다. 같은 URL을 여러 사용자가 저장해도 사용자 저장 링크 행은 독립적으로 생성한다.

## ERD

```mermaid
erDiagram
  USER_LINKS {
    bigint id PK
    bigint user_id
    bigint folder_id
    text original_url
    text normalized_url
    text final_url
    varchar domain
    varchar title
    jsonb metadata
    text ai_summary
    varchar ai_summary_status
    text memo
    timestamptz deleted_at
    timestamptz created_at
    timestamptz updated_at
  }
```

## 필드

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| id | bigint | Y | 사용자 저장 링크 식별자 |
| user_id | bigint | Y | 링크를 저장한 회원 ID |
| folder_id | bigint | N | 저장된 커스텀 폴더 ID. `NULL`이면 미분류 |
| original_url | text | Y | 사용자가 저장을 요청한 원본 URL |
| normalized_url | text | Y | 사용자별 중복 저장 판단 키. redirect 추적 성공 시 `final_url`, 실패 시 `original_url`을 정규화 |
| final_url | text | N | redirect 이후 최종 도착 URL. 추적 실패 시 `NULL` 가능 |
| domain | varchar | N | 출처 표시와 검색에 사용하는 도메인. `final_url` 우선, 없으면 `original_url` 기준 |
| title | varchar | N | 수집된 제목. 수집 실패 시 `NULL` 가능 |
| metadata | jsonb | N | Open Graph, favicon, description, 이미지 정보, 색상 등 확장 메타데이터. 최상위에 `version` 포함 |
| ai_summary | text | N | AI 요약 결과 |
| ai_summary_status | varchar | Y | AI 요약 대표 상태. 예: `PENDING`, `SUCCESS`, `NEEDS_REVIEW`, `FAILED` |
| memo | text | N | 사용자 메모. 최대 500자 |
| deleted_at | timestamptz | N | 최근 삭제된 항목으로 이동한 일시 |
| created_at | timestamptz | Y | 링크 저장 일시이자 레코드 생성 일시 |
| updated_at | timestamptz | Y | 레코드 수정 일시 |

## 제약

- 동일 URL 중복 저장 방지는 사용자 단위로 처리한다.
- 활성 링크는 `user_id + normalized_url` 기준으로 중복 저장을 막는다.
- `id + user_id` 유니크 제약을 둔다. `tags`의 `(link_id, user_id)` 복합 FK가 참조하는 대상으로, 태그·링크의 소유자 정합성을 보장하기 위함이다.
- `normalized_url`은 redirect 추적에 성공하면 `final_url`을 정규화하고, 실패하면 `original_url`을 정규화해 저장한다.
- 같은 URL이 최근 삭제된 항목에 있을 때 새 저장을 막을지, 새 저장을 허용할지, 복원으로 유도할지는 기획 논의가 필요하다.
- 폴더 미선택 상태와 복원 후 미분류 상태는 `folder_id IS NULL`로 표현한다.
- 링크 저장 최신순 정렬은 `created_at`을 기준으로 한다.
- 영구 삭제 대상은 별도 컬럼 없이 `deleted_at <= now() - interval '30 days'` 조건으로 판단한다.
- 복원 시 `deleted_at`을 `NULL`로 되돌린다.
- 검색 대상은 `title`, `domain`, `original_url`, `final_url`, `ai_summary`, `memo`이며, `deleted_at IS NULL`인 링크만 포함한다.
- `ai_summary_status`는 목록/상세 화면에서 사용하는 사용자 저장 링크 단위 대표 상태다.
- AI 요약 시도의 모델, 프롬프트, 토큰, 비용, TTLB, 에러, 생성 요약문은 `ai_summary_metrics`에 저장한다.
- `ai_summary_metrics.status`는 개별 요약 시도 상태이며, `user_links.ai_summary_status`와 범위가 다르다.
- `metadata`는 확장 정보 보관용이며, 목록/검색/정렬에 자주 쓰는 값은 별도 컬럼으로 둔다.
- 이미지 URL, 이미지 후보 목록, 이미지 색상 정보는 별도 컬럼 없이 `metadata`에 저장한다.
- `metadata.version`은 JSON 구조 버전이며, 구조가 바뀌면 애플리케이션의 버전별 처리기가 해석한다.

## metadata 구조

`metadata`는 최상위에 `version`을 포함한다. 버전별 JSON 구조는 달라질 수 있으며, 애플리케이션은 `version`에 맞는 처리기로 파싱한다.

```json
{
  "version": 1,
  "description": "페이지 설명",
  "faviconUrl": "https://example.com/favicon.ico",
  "images": [
    {
      "url": "https://example.com/og.png",
      "source": "og:image",
      "width": 1200,
      "height": 630,
      "dominantColor": "#1F2937"
    }
  ]
}
```

- `version`: `metadata` JSON 구조 버전.
- `description`: 수집된 페이지 설명.
- `faviconUrl`: 수집된 favicon URL.
- `images`: 수집된 이미지 후보 목록.
- `images[].source`: 이미지 출처. 예: `og:image`, `twitter:image`.
- `images[].dominantColor`: 이미지 대표 색상.

## 인덱스 설계

```sql
ALTER TABLE user_links
  ADD CONSTRAINT user_links_id_user_id_unique UNIQUE (id, user_id);

CREATE UNIQUE INDEX user_links_user_id_normalized_url_active_idx
  ON user_links (user_id, normalized_url)
  WHERE deleted_at IS NULL;

CREATE INDEX user_links_user_id_created_at_idx
  ON user_links (user_id, created_at DESC);

CREATE INDEX user_links_user_id_folder_id_created_at_idx
  ON user_links (user_id, folder_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX user_links_user_id_deleted_at_idx
  ON user_links (user_id, deleted_at);

CREATE INDEX user_links_deleted_at_idx
  ON user_links (deleted_at)
  WHERE deleted_at IS NOT NULL;
```

- `id + user_id` (유니크 제약): `tags`의 `(link_id, user_id)` 복합 FK 참조 대상. 태그·링크 소유자 정합성 보장용.
- `user_id + normalized_url`: 사용자별 활성 링크 중복 저장 방지.
- `user_id + created_at`: 내 링크 목록 최신순 조회용.
- `user_id + folder_id + created_at`: 폴더별 링크 목록 조회용.
- `user_id + deleted_at`: 사용자별 최근 삭제된 항목 조회용.
- `deleted_at`: 전체 영구 삭제 배치 대상 조회용.

## 향후 확장

- 사용자가 AI 요약을 직접 수정할 수 있게 되면 원본 AI 요약과 사용자 수정 요약을 분리할지 결정한다.
