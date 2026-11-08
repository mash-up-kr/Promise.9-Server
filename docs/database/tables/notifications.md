# 알림 테이블

푸시 도입을 위한 DB 기반이다. 이 마이그레이션은 테이블만 추가하며 기존 이메일 배치의 동작은 바꾸지 않는다. API, 발송 worker, 설정 반영, receipt 조회는 후속 구현이 필요하다.

## ERD

```mermaid
erDiagram
    USERS ||--o{ PUSH_TOKENS : registers
    USERS ||--o{ NOTIFICATION_SETTINGS : configures
    LINKS ||--o{ EMAIL_HISTORIES : triggers
    LINKS ||--o{ PUSH_HISTORIES : triggers
    PUSH_TOKENS |o--o{ PUSH_HISTORIES : targets
    PUSH_TOKENS {
        bigint id PK
        bigint user_id FK
        text token UK
        varchar platform
        timestamptz created_at
        timestamptz updated_at
    }
    NOTIFICATION_SETTINGS {
        bigint id PK
        bigint user_id FK
        varchar channel
        boolean enabled
        timestamptz created_at
        timestamptz updated_at
    }
    EMAIL_HISTORIES {
        bigint id PK
        bigint link_id FK
        uuid occurrence_id
        varchar status
        varchar ses_message_id
        timestamptz created_at
        timestamptz updated_at
    }
    PUSH_HISTORIES {
        bigint id PK
        bigint link_id FK
        uuid occurrence_id
        bigint push_token_id FK
        varchar status
        varchar ticket_id
        varchar error_code
        timestamptz created_at
        timestamptz updated_at
    }
```

## 필드·제약·인덱스

모든 `id`는 기존 테이블과 같은 bigint identity PK다. `created_at`, `updated_at`은 NOT NULL이며 기본값은 `now()`다. **갱신 시 `updated_at`을 애플리케이션에서 직접 설정한다.**

| 테이블                  | 필드와 의미                                                                                                                                                                       | 제약·조회 경로                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `push_tokens`           | `user_id`: 소유자, `token`: 발송 가능한 원문, `platform`: `ios` / `android`                                                                                                       | 전역 token UNIQUE, 빈 토큰 거부, 플랫폼 CHECK, user_id 인덱스                                                                                   |
| `notification_settings` | `user_id`: 소유자, `channel`: `email` / `push`, `enabled`: 허용 여부                                                                                                              | `(user_id, channel)` UNIQUE, 채널 CHECK. enabled는 명시적으로 지정                                                                              |
| `email_histories`       | `link_id`: 대상 링크, `occurrence_id`: 회차 UUID, `status`: 처리 상태, `ses_message_id`: SES 접수 ID(nullable)                                                                    | `(link_id, occurrence_id)` UNIQUE, 상태 CHECK, ACCEPTED는 message ID 필수, `(status, updated_at)` 인덱스                                        |
| `push_histories`        | `link_id`, `occurrence_id`: 대상 회차, `push_token_id`: 대상 기기(nullable), `status`: 처리 상태, `ticket_id`: 접수 ID(nullable), `error_code`: 정제된 제공자 오류 코드(nullable) | `(link_id, occurrence_id, push_token_id)` UNIQUE, 상태 CHECK, ACCEPTED/RECEIPT_OK는 ticket 필수, push_token_id 및 `(status, updated_at)` 인덱스 |

`token`은 임의의 길이 제한을 만들지 않고 text로 저장한다. 공개 API에서는 제공자 형식과 요청 크기를 검증해야 한다. 플랫폼은 모바일 앱 두 종류만 지원한다. 공급자는 아직 연동하지 않았으며 `ticket_id` 기반 상태는 Expo를 가정한다.

## 상태와 회차

| 상태         | 의미                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| `PENDING`    | 발송 대상으로 확정되어 처리 대기/진행 중                                      |
| `ACCEPTED`   | SES 또는 푸시 제공자가 요청을 접수함. 사용자 수신을 보장하지 않음             |
| `RECEIPT_OK` | 푸시 receipt 성공. 단말 표시·열람을 보장하지 않음. 이메일에서는 사용하지 않음 |
| `FAILED`     | 실패가 확정됨. 영구/일시 실패 분류는 worker 책임                              |
| `UNKNOWN`    | 타임아웃 등으로 제공자가 접수했는지 확인할 수 없음                            |

이력은 **발송 시도마다 추가하는 로그가 아니라 회차별 대상의 현재 처리 상태**다. 재시도는 같은 행을 갱신한다. 새 리마인드 일정은 새 occurrence UUID를 사용하며 `links.reminder_occurrence_id`에 보관한다. 컬럼은 nullable이며 기존 일정의 값은 NULL로 유지한다. 발송 연동 시 기존 일정의 UUID를 한 번 채우고, 일정 생성·변경 코드에서 새 UUID를 저장해야 한다. `occurrence_id`에는 `defaultRandom()`을 두지 않는다. 하나의 일정에 대해 한 번 만든 UUID를 모든 채널·기기·재시도에서 공유해야 하기 때문이다.

UNIQUE는 같은 UUID의 대상 중복 생성만 막는다. worker의 독점 처리나 외부 API의 exactly-once 발송을 보장하지 않는다. UNKNOWN을 자동 재발송하면 중복 수신할 수 있다.

## 삭제·토큰 정책

- 사용자 **영구 삭제** 시 토큰·설정은 CASCADE 삭제된다. soft delete는 FK를 발동시키지 않으므로 발송 조회에서 `users.deleted_at IS NULL`을 확인해야 한다.
- 링크 **영구 삭제** 시 이메일·푸시 이력도 CASCADE 삭제된다. 장기 감사 로그가 필요하다면 보존 정책을 바꿔야 한다.
- 토큰 영구 삭제 시 이력은 남고 `push_token_id`만 SET NULL이 된다. 로그아웃·토큰 만료 시 토큰 행을 DELETE한다. 별도 무효화 상태는 두지 않는다. NULL 이력은 재발송하지 않는다.
- PostgreSQL의 UNIQUE는 기본적으로 NULL을 서로 다르게 취급하므로, 토큰 삭제 후 남은 NULL 이력에는 대상 중복 방지 효력이 없다. 신규 이력을 만들 때는 반드시 실제 token ID를 지정한다. 여러 기기의 과거 이력이 모두 NULL이 될 수 있어 NULLS NOT DISTINCT 제약은 사용하지 않는다. [PostgreSQL 제약조건 문서](https://www.postgresql.org/docs/current/ddl-constraints.html)
- 토큰은 전역 UNIQUE다. 계정 전환 시 이전 계정의 토큰을 삭제하고 새 계정으로 안전하게 재등록한다. 과거 PENDING을 새 계정의 토큰으로 발송하지 않도록 발송 직전에 링크와 토큰 소유자를 비교한다. 토큰 소유자 변경과 발송 간 경쟁도 고려해야 한다.
- 토큰은 발송에 원문이 필요하므로 해시로 대체하지 않는다. 로그·Swagger 예시·일반 API 응답에 원문을 노출하지 않는다. 원문 제공자 오류 대신 `error_code`만 저장한다.

## 구현 전에 해결할 리뷰

1. **P1 — 이메일 발송이 푸시 대상을 없앨 수 있음.** 현재 `ReminderRepository.markSent()`는 이메일 성공 후 `links.reminder_at`을 NULL로 만든다. 두 채널이 독립적으로 reminder_at을 조회하면 먼저 성공한 채널이 다른 채널의 대상을 지운다. 공통 dispatcher가 일정별 UUID와 채널별 대상 행을 트랜잭션 안에서 확정한 뒤 일정을 소비하고, worker는 이력을 조회하도록 연결해야 한다. 이번 변경에는 dispatcher가 없다.
2. **P1 — 회차를 영속화하지 않으면 중복 방지가 무효화됨.** 배치 실행마다 random UUID를 만들면 같은 일정의 대상 행이 계속 생긴다. 추가한 `links.reminder_occurrence_id`를 사용해 발송 연동 시 일정 생성·변경 시점에 회차를 저장하고 재시도에서는 재사용해야 한다. 이번 변경은 컬럼만 추가하며 기존 일정과 쓰기 경로의 연결은 후속 작업이다. 다중 인스턴스에서는 `waitForCompletion`만으로 중복 발송을 막을 수 없다.
3. **P1 — 토큰과 링크의 소유자 일치는 단독 FK로 보장되지 않음.** 현재 ERD의 각 FK는 존재 여부만 확인한다. 새 토큰/설정 API는 JWT guard와 검증을 적용하고 user_id를 인증 컨텍스트에서 가져와야 한다. worker는 링크 소유자=토큰 소유자, 활성 사용자, 미삭제 링크, 토큰 존재 여부, 채널 허용을 재검증해야 한다. 잘못 연결하면 다른 사용자의 링크 알림이 전송된다.
4. **P1 — 설정 테이블만 추가하면 수신 거부가 작동하지 않음.** 현재 이메일 배치는 설정을 읽지 않는다. 설정 API를 공개하기 전에 이메일·푸시 조회 모두에서 enabled를 반영해야 한다. 제안하는 미설정 정책은 기존 이메일 ON 유지, 푸시 OFF이며, 후속 발송 코드에 명시적으로 구현해야 한다. 이번 마이그레이션은 사용자의 동의를 추정해 설정을 일괄 생성하지 않는다.
5. **P2 — ticket 성공을 최종 수신으로 처리하면 실패를 놓침.** Expo 사용 시 ticket은 접수 결과이고 receipt에서 뒤늦은 실패가 나올 수 있다. receipt 조회와 `DeviceNotRegistered` 토큰 무효화를 구현해야 한다. [Expo 발송 문서](https://docs.expo.dev/push-notifications/sending-notifications/)

다음 구현 범위는 인증된 토큰 등록·해제/설정 API → 공통 dispatcher → 채널별 worker와 재시도·receipt 처리 순서가 적절하다. 비활성 채널·등록 기기 없음은 대상 이력을 만들지 않는 정책으로 시작한다.

## 적용과 검증

`drizzle/0015_notification_schema.sql`은 새 테이블·제약·인덱스와 nullable `links.reminder_occurrence_id` 컬럼을 추가한다. 기존 데이터 변경이나 backfill은 없다. FK 생성 시 기존 users/links 잠금이 필요하므로 운영 적용은 별도로 수행한다.

```sh
bun run db:migrate
TEST_DATABASE_URL=postgresql://postgres:integration@127.0.0.1:55432/promise9_test \
  bun run test:integration --testPathPattern=notification-schema
```

테스트 DB 실행 방법은 [통합 테스트 안내](../../../test/README.md)를 따른다. 통합 테스트는 중복 설정·토큰·회차, 잘못된 상태·FK, 기기별 분리, 토큰 SET NULL, 링크·사용자 CASCADE를 검증한다.
