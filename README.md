<div align="center">

# 프로미스 나인

프로미스 나인 서버 프로젝트입니다.

</div>

## 기술 스택

- NestJS
- TypeScript
- Bun
- PostgreSQL
- Drizzle ORM
- Jest

## 시작하기

```bash
bun install
```

## 실행

```bash
# 개발 서버
bun run start:dev

# 일반 실행
bun run start

# 프로덕션 실행
bun run build
bun run start:prod
```

기본 포트는 `3000`이며, `PORT` 환경변수로 변경할 수 있습니다.

## 환경 변수

`.env.example`을 참고해 `.env`를 생성합니다.

```bash
NODE_ENV=development
DATABASE_URL_DEVELOPMENT=postgres://postgres:postgres@localhost:5432/promise9
DATABASE_URL_PRODUCTION=postgres://user:password@host:5432/promise9?sslmode=verify-full
```

`NODE_ENV=production`일 때는 `DATABASE_URL_PRODUCTION`을 사용하고, 그 외 환경에서는 `DATABASE_URL_DEVELOPMENT`를 사용합니다.
Render 같은 managed PostgreSQL이 SSL을 요구하면 URL 끝에 `?sslmode=verify-full`을 붙입니다.

## 데이터베이스

스키마는 `src/database/schema.ts`에 정의합니다. PostgreSQL `jsonb` 컬럼은 Drizzle의 `jsonb().$type<T>()`로 타입을 지정해서 사용할 수 있습니다.

```bash
# 마이그레이션 파일 생성
bun run db:generate

# 마이그레이션 실행
bun run db:migrate

# 스키마 직접 반영
bun run db:push

# Drizzle Studio
bun run db:studio
```

## 테스트

```bash
# 단위 테스트
bun run test

# e2e 테스트
bun run test:e2e

# 테스트 커버리지
bun run test:cov
```

## 코드 품질

```bash
# 린트
bun run lint

# 포맷팅
bun run format
```

## 팀

<table>
  <tr>
    <td align="center" width="160">
      <a href="https://github.com/hyoinkang">
        <img src="https://github.com/hyoinkang.png?size=120" width="100" height="100" alt="강효인 프로필 이미지" />
      </a>
      <br />
      <strong>강효인</strong>
      <br />
      <a href="https://github.com/hyoinkang">@hyoinkang</a>
      <br />
      <sub>hyoinkang</sub>
    </td>
    <td align="center" width="160">
      <a href="https://github.com/ninaxlee">
        <img src="https://github.com/ninaxlee.png?size=120" width="100" height="100" alt="Nina 프로필 이미지" />
      </a>
      <br />
      <strong>Nina</strong>
      <br />
      <a href="https://github.com/ninaxlee">@ninaxlee</a>
      <br />
      <sub>ninaxlee</sub>
    </td>
    <td align="center" width="160">
      <a href="https://github.com/vcz-Chan">
        <img src="https://github.com/vcz-Chan.png?size=120" width="100" height="100" alt="이승찬 프로필 이미지" />
      </a>
      <br />
      <strong>이승찬</strong>
      <br />
      <a href="https://github.com/vcz-Chan">@vcz-Chan</a>
      <br />
      <sub>vcz-Chan</sub>
    </td>
    <td align="center" width="160">
      <a href="https://github.com/Choi-JY1107">
        <img src="https://github.com/Choi-JY1107.png?size=120" width="100" height="100" alt="최재영 프로필 이미지" />
      </a>
      <br />
      <strong>최재영</strong>
      <br />
      <a href="https://github.com/Choi-JY1107">@Choi-JY1107</a>
      <br />
      <sub>Choi-JY1107</sub>
    </td>
  </tr>
</table>
