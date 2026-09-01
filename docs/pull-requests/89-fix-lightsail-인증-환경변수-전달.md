# PR #89: fix: Lightsail 인증 환경변수 전달

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/89
- Author: @vcz-Chan
- Base: main
- Head: hotfix/lightsail-auth-env
- Merged: 2026-08-23T12:05:26Z

## PR Body

## 문제

PR #78에서 `KAKAO_CLIENT_ID`, `APPLE_CLIENT_ID`가 필수 환경변수가 됐지만 Lightsail 배포 workflow가 두 값을 운영 `.env`에 기록하지 않아 API 컨테이너가 시작 직후 종료했습니다. PR #79 배포도 같은 원인으로 실패했습니다.

DB schema 및 migration 변경과는 무관합니다.

## 변경 사항

- `KAKAO_CLIENT_ID`, `APPLE_CLIENT_ID`를 배포 환경에 전달하고 누락 시 배포 전에 실패하도록 검증
- 선택값인 `KAKAO_CLIENT_SECRET`은 값이 있을 때만 운영 `.env`에 기록
- 기존 DB 및 API 배포 방식은 변경하지 않음

## 검증

- YAML 파싱 성공
- `git diff --check` 통과
- 전체 테스트 142개 통과

## 배포 후 확인

- `Deploy To Lightsail` workflow 성공
- API healthcheck 및 외부 `200 OK` 확인
- 컨테이너 로그에 환경변수 검증 오류가 없는지 확인
