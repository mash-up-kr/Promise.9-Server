# Database

Promise.9 서버 DB 문서의 시작점입니다.

## 문서 목록

| 문서                          | 내용                                                     |
| ----------------------------- | -------------------------------------------------------- |
| [Setup](./setup.md)           | PostgreSQL, Drizzle ORM, 환경변수, 마이그레이션 흐름     |
| [Operations](./operations.md) | DB 백업, 백업 검증, 상태 확인, Mermaid ERD 생성 스크립트 |

## 작성 기준

- DB 문서는 `docs/database` 하위에 둡니다.
- 테이블 설계 문서는 `docs/database/tables` 하위에 테이블 단위로 둡니다.
- 테이블 설계 문서는 Mermaid ERD와 필드 설명을 포함합니다.
- 테이블명은 복수형 `snake_case`를 사용합니다.
