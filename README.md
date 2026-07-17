<div align="center">

# 링띵똥 Server

흩어진 링크를 저장하고, 정리하고, 다시 찾기 쉽게 만드는 링띵똥의 백엔드 서버입니다.

<p>
  <a href="./docs/README.md">Docs</a> ·
  <a href="./docs/api/README.md">API</a> ·
  <a href="./docs/database/README.md">Database</a> ·
  <a href="./docs/convention/README.md">Convention</a>
</p>

</div>

## Overview

링띵똥 Server는 링띵똥 서비스의 HTTP API 서버입니다. NestJS, PostgreSQL, Drizzle ORM을 기반으로 API, 데이터베이스 스키마, 마이그레이션, 운영 문서를 함께 관리합니다.

## Tech Stack

| Area | Stack |
| --- | --- |
| Runtime | Bun |
| Framework | NestJS, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Validation | Zod |
| API Docs | Swagger |
| Test | Jest |

## Project Structure

```text
.
├── docs/                  # API, DB, 컨벤션, 정책 문서
├── src/
│   ├── common/            # 공통 DTO, 예외, 필터, 인터셉터
│   ├── config/            # 환경변수, Swagger, 데이터베이스 설정
│   ├── app.module.ts      # 루트 NestJS 모듈
│   └── main.ts            # 애플리케이션 부트스트랩
├── test/                  # e2e 테스트
├── drizzle.config.ts      # Drizzle Kit 설정
└── package.json
```

## Documentation

| 문서 | 내용 |
| --- | --- |
| [Docs](./docs/README.md) | 서버 문서의 시작점입니다. |
| [API](./docs/api/README.md) | API 명세와 연동 기준입니다. |
| [Database](./docs/database/README.md) | DB 설정, 마이그레이션, 테이블 설계 문서입니다. |
| [Convention](./docs/convention/README.md) | 이슈, 브랜치, PR, 머지, 커밋 규칙입니다. |
| [Policy](./docs/policy/README.md) | 도메인 정책 문서입니다. |

## Team

<table>
  <tr>
    <td align="center" width="150">
      <a href="https://github.com/hyoinkang">
        <img src="https://github.com/hyoinkang.png?size=120" width="88" height="88" alt="강효인 프로필 이미지" />
      </a>
      <br />
      <strong>강효인</strong>
      <br />
      <a href="https://github.com/hyoinkang">@hyoinkang</a>
    </td>
    <td align="center" width="150">
      <a href="https://github.com/ninaxlee">
        <img src="https://github.com/ninaxlee.png?size=120" width="88" height="88" alt="이미나 프로필 이미지" />
      </a>
      <br />
      <strong>이미나</strong>
      <br />
      <a href="https://github.com/ninaxlee">@ninaxlee</a>
    </td>
    <td align="center" width="150">
      <a href="https://github.com/vcz-Chan">
        <img src="https://github.com/vcz-Chan.png?size=120" width="88" height="88" alt="이승찬 프로필 이미지" />
      </a>
      <br />
      <strong>이승찬</strong>
      <br />
      <a href="https://github.com/vcz-Chan">@vcz-Chan</a>
    </td>
    <td align="center" width="150">
      <a href="https://github.com/Choi-JY1107">
        <img src="https://github.com/Choi-JY1107.png?size=120" width="88" height="88" alt="최재영 프로필 이미지" />
      </a>
      <br />
      <strong>최재영</strong>
      <br />
      <a href="https://github.com/Choi-JY1107">@Choi-JY1107</a>
    </td>
  </tr>
</table>
