# PR #54: [fix] 운영 빌드 엔트리 경로 복구

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/54
- Author: @vcz-Chan
- Base: main
- Head: fix/build-output-path
- Merged: 2026-07-17T02:54:20Z

## PR Body

## 📌 개요

루트의 `script/**/*.ts`가 TypeScript 컴파일 대상에 포함되면서 서버 엔트리가 `dist/src/main.js`로 생성됐지만, Docker는 `dist/main.js`를 실행해 배포가 실패했습니다.

서버 빌드 범위를 `src`로 제한해 기존 실행 경로를 복구했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `rootDir`을 `src`로 지정
- [x] 운영 빌드 대상을 `src/**/*.ts`로 제한
- [x] incremental 빌드 캐시를 `dist` 내부에 저장

## 🔍 검증

- `bun run build`
- `bun test --runInBand` — 65개 통과
- `dist/main.js` 생성 및 `dist/src/main.js`, `dist/script/` 미생성 확인
