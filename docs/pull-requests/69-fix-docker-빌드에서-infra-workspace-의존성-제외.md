# PR #69: fix: Docker 빌드에서 infra workspace 의존성 제외

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/69
- Author: @vcz-Chan
- Base: main
- Head: fix/docker-root-deps
- Merged: 2026-08-12T10:29:59Z

## PR Body

## 📌 개요

AWS CDK용 `infra` workspace 추가 이후 Docker 의존성 설치 단계에서 `Workspace not found "infra"` 오류가 발생하는 문제를 수정합니다.

애플리케이션 Docker 이미지에는 CDK 관련 소스와 의존성을 포함하지 않도록 루트 `promise9` 패키지만 설치하도록 변경했습니다.

## ✅ 변경 사항

- Docker 의존성 설치 단계에 workspace 검증용 `infra/package.json`만 복사
- `deps`, `prod-deps` 단계에서 `--filter promise9` 적용
- `.dockerignore`에서 `infra` 소스를 제외하고 `infra/package.json`만 허용
- production 이미지에서 `aws-cdk-lib`, `constructs` 등 CDK 의존성 제외

## 🔍 검증

- `bun install --ignore-scripts --frozen-lockfile --filter promise9`
- `bun install --ignore-scripts --frozen-lockfile --production --filter promise9`
- `bun run build`
- `aws-cdk-lib`, `constructs`, `@promise9/infra`, `infra/node_modules` 미생성 확인
- `git diff --check`

## 🔗 관련 실행

- https://github.com/mash-up-kr/Promise.9-Server/actions/runs/31392968874/job/93468889361
