# Database

Promise.9 서버 DB 문서의 시작점입니다.

## 문서 목록

| 문서                          | 내용                                                 |
| ----------------------------- | ---------------------------------------------------- |
| [Setup](./setup.md)           | PostgreSQL, Drizzle ORM, 환경변수, 마이그레이션 흐름 |
| [Operations](./operations.md) | DB 백업, 복구, 상태 확인, Mermaid ERD 생성 스크립트  |
| [Restore](./restore.md)       | DB 복구 스크립트 사용법과 안전 조건                  |
| [ERD](./erd.md)               | 전체 테이블 통합 ERD (커밋된 설계 문서 기준)         |
| [Tables](./tables)            | 테이블별 상세 설계 (필드·제약·인덱스)                |

## 테이블 설계

| 테이블                                         | 설명                         |
| ---------------------------------------------- | ---------------------------- |
| [users](./tables/users.md)                     | 회원 계정 기준 테이블        |
| [social_accounts](./tables/social_accounts.md) | 소셜 로그인 계정 연결 테이블 |
| [refresh_tokens](./tables/refresh_tokens.md)   | Refresh Token 관리 테이블    |
| [ai_metrics](./tables/ai_metrics.md)           | LLM 호출 결과 로그           |

## 작성 기준

- DB 문서는 `docs/database` 하위에 둡니다.
- 테이블 설계 문서는 `docs/database/tables` 하위에 테이블 단위로 둡니다.
- 테이블 설계 문서는 Mermaid ERD와 필드 설명을 포함합니다.
- 테이블명은 복수형 `snake_case`를 사용합니다.
