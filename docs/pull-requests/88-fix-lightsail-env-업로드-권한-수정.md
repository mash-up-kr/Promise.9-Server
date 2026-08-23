# PR #88: fix: Lightsail env 업로드 권한 수정

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/88
- Author: @vcz-Chan
- Base: main
- Head: fix/lightsail-env-upload
- Merged: 2026-08-23T11:42:50Z

## PR Body

## 📌 개요

PR #85 병합 배포에서 runtime env 파일 업로드가 권한 오류로 실패한 문제를 수정합니다.

## 원인

GitHub runner에서 업로드 전에 `.env.production`을 `600`으로 변경해 `scp-action` 컨테이너가 파일을 읽지 못했습니다.

## 변경

- runner의 사전 `chmod 600` 제거
- 서버 업로드 후 `/opt/promise9/.env`에 적용하는 `chmod 600`은 유지

## 검증

- GitHub Actions YAML parse 통과
- Jest `24 suites / 142 tests` 통과
- 현재 운영 API health `200`
- 실패가 upload 단계에서 발생해 DB 및 운영 API 설정에는 영향 없음
