# users

회원 계정의 기준 테이블이다. 설정 화면의 이메일 표시, 회원 탈퇴 처리 시점, 사용자별 링크/폴더 소유권의 기준이 된다.

## ERD

```mermaid
erDiagram
  USERS ||--o{ SOCIAL_ACCOUNTS : owns
  USERS ||--o{ FOLDERS : creates
  USERS ||--o{ USER_LINKS : saves
  USERS ||--o{ REFRESH_TOKENS : issues

  USERS {
    bigint id PK
    varchar email UK
    jsonb first_marketing_touch
    jsonb last_marketing_touch
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  SOCIAL_ACCOUNTS {
    bigint id PK
    bigint user_id FK
  }

  FOLDERS {
    bigint id PK
    bigint user_id FK
  }

  USER_LINKS {
    bigint id PK
    bigint user_id FK
  }

  REFRESH_TOKENS {
    bigint id PK
    bigint user_id FK
  }
```

## 필드

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| id | bigint | Y | 회원 식별자 |
| email | varchar | Y | 설정 화면에 표시할 대표 이메일 |
| first_marketing_touch | jsonb | N | 계정에 처음 저장된 유효 마케팅 접점. 이후 보존 |
| last_marketing_touch | jsonb | N | 수집 시각이 가장 최근인 마케팅 접점 |
| created_at | timestamptz | Y | 회원 생성 일시 |
| updated_at | timestamptz | Y | 회원 정보 수정 일시 |
| deleted_at | timestamptz | N | 회원 탈퇴 또는 소프트 삭제 일시 |

## 제약

- `email`은 대표 이메일 기준으로 유니크하게 관리한다.
- 이메일 미제공 소셜 계정 또는 동일 이메일 계정 병합은 인증 정책에서 결정한다.

## 마케팅 접점

두 컬럼은 `touch_id`, `captured_at`, UTM 다섯 필드를 담은 객체 또는 SQL `NULL`이다. `model`·`scope`는 이벤트에서 추가한다.

`PATCH /users/me/attribution`은 사용자 행을 트랜잭션에서 잠그고 갱신한다. 최초 접점은 보존하고 최근 접점은 더 큰 `captured_at`일 때 전체 교체한다. 검증 규칙과 응답은 [사용자 API](../../api/user.md#마케팅-접점-동기화)를 참고한다.

`0014_user_marketing_attribution.sql`은 nullable 컬럼 두 개를 추가하며 기존 행의 값은 `NULL`이다.
