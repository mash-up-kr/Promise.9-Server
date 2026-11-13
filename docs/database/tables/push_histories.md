# push_histories

링크 리마인드 푸시의 발송 결과와 ticket을 저장하는 테이블이다.

## ERD

```mermaid
erDiagram
  LINKS ||--o{ PUSH_HISTORIES : triggers

  LINKS {
    bigint id PK
    bigint user_id
    uuid reminder_occurrence_id
  }

  PUSH_HISTORIES {
    bigint id PK
    bigint user_id FK
    bigint link_id FK
    uuid occurrence_id
    varchar status
    varchar ticket_id
    varchar error_code
    timestamptz created_at
    timestamptz updated_at
  }
```

## 필드

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| id | bigint | Y | 푸시 발송 이력 식별자. identity PK |
| user_id | bigint | Y | 링크 소유 회원 ID |
| link_id | bigint | Y | 대상 링크 ID |
| occurrence_id | uuid | Y | 이메일·푸시가 공유하는 리마인드 회차 UUID |
| status | varchar(20) | Y | `PENDING`, `ACCEPTED`, `RECEIPT_OK`, `FAILED`, `UNKNOWN`. 기본값 `PENDING` |
| ticket_id | varchar(255) | N | 푸시 제공자의 접수 ID |
| error_code | varchar(100) | N | 푸시 제공자 오류 코드 |
| created_at | timestamptz | Y | 이력 생성 일시. 기본값 `now()` |
| updated_at | timestamptz | Y | 상태 수정 일시. 기본값 `now()`, 갱신 시 직접 설정 |

## 제약

- `(link_id, user_id)`는 `links(id, user_id)`를 참조해 링크 소유자와 이력 소유자의 일치를 강제하며, 링크 영구 삭제 시 함께 삭제된다. (`ON DELETE CASCADE`)
- `occurrence_id`에는 UUID 자동 생성 기본값과 `links.reminder_occurrence_id`에 대한 물리 FK를 두지 않는다.
- `status`는 CHECK로 필드 표에 명시된 값만 허용한다. `ACCEPTED`, `RECEIPT_OK` 상태는 `ticket_id`가 NULL일 수 없다.
- 동일 회차의 여러 발송 결과를 저장할 수 있도록 `(link_id, occurrence_id)`에는 UNIQUE를 두지 않는다.

## 인덱스 설계

```sql
CREATE INDEX push_histories_link_id_idx
  ON push_histories (link_id);

CREATE INDEX push_histories_status_updated_at_idx
  ON push_histories (status, updated_at);
```

- `link_id`: 링크별 이력 조회와 링크 영구 삭제 시 참조 행 탐색.
- `(status, updated_at)`: 발송 처리·receipt 조회 대상 탐색.
