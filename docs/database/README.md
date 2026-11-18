# Database

Promise.9 서버 DB 문서의 시작점입니다.

## 문서 목록

| 문서                                          | 내용                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| [Setup](./setup.md)                           | PostgreSQL, Drizzle ORM, 환경변수, 마이그레이션 흐름 |
| [Operations](./operations.md)                 | DB 백업, 상태 확인, 운영 SSH 터널과 Mermaid ERD      |
| [pgAdmin SSH Tunnel](./pgadmin-ssh-tunnel.md) | PEM 키를 사용한 운영 DB pgAdmin 접속                 |
| [Restore](./restore.md)                       | 개발·운영 DB 복구 절차와 안전 조건                   |
| [ERD](./erd.md)                               | 전체 테이블 통합 ERD (커밋된 설계 문서 기준)         |
| [Tables](./tables)                            | 테이블별 상세 설계 (필드·제약·인덱스)                |

## 테이블 설계

| 테이블                                         | 설명                         |
| ---------------------------------------------- | ---------------------------- |
| [users](./tables/users.md)                     | 회원 계정 기준 테이블        |
| [social_accounts](./tables/social_accounts.md) | 소셜 로그인 계정 연결 테이블 |
| [refresh_tokens](./tables/refresh_tokens.md)   | Refresh Token 관리 테이블    |
| [folders](./tables/folders.md) | 사용자 폴더 |
| [links](./tables/user_links.md) | 사용자 저장 링크 |
| [tags](./tables/tags.md) | 링크 태그 |
| [ai_metrics](./tables/ai_metrics.md)           | LLM 호출 결과 로그           |
| [push_tokens](./tables/push_tokens.md) | 기기별 푸시 토큰 |
| [notification_settings](./tables/notification_settings.md) | 채널별 알림 수신 설정 |
| [email_histories](./tables/email_histories.md) | 이메일 발송 이력 |
| [push_histories](./tables/push_histories.md) | 푸시 발송 이력 |

## 작성 기준

- DB 문서는 `docs/database` 하위에 둡니다.
- 테이블 설계 문서는 `docs/database/tables` 하위에 테이블 단위로 둡니다.
- 테이블 설계 문서는 Mermaid ERD와 필드 설명을 포함합니다.
- 테이블명은 복수형 `snake_case`를 사용합니다.
