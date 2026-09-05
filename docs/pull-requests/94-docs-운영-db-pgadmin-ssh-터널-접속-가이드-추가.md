# PR #94: [docs] 운영 DB pgAdmin SSH 터널 접속 가이드 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/94
- Author: @vcz-Chan
- Base: main
- Head: docs/pgadmin-ssh-tunnel
- Merged: 2026-09-05T04:50:53Z

## PR Body

## 📌 개요

운영 PostgreSQL은 외부에 직접 공개되지 않아 Lightsail SSH 터널을 통해 접근해야 합니다.
팀에서 전달받은 PEM 키로 pgAdmin Desktop에서 운영 DB에 접속하는 절차를 문서화했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] PEM 키를 사용한 운영 DB SSH 터널 명령 추가
- [x] pgAdmin Desktop의 SSH Tunnel 설정값 문서화
- [x] 로컬 CLI 터널을 이용한 대체 접속 방법 추가
- [x] 단계별 pgAdmin 스크린샷과 설명 추가
- [x] PEM 권한 및 SSH host key 검증 주의사항 추가
- [x] Database 문서 목록에 pgAdmin 가이드 연결

## 💬 리뷰어에게

- 처음 접속하는 팀원이 문서만 보고 pgAdmin 설정을 완료할 수 있는지 확인 부탁드립니다.
- `api.link-ding-dong.com`을 SSH host로 사용하는 현재 운영 구성이 적절한지 확인 부탁드립니다.
- 비밀번호, PEM 본문, 토큰 등 실제 인증정보는 포함하지 않았습니다.

## 🔗 관련 이슈

관련 이슈 없음

## 🔍 상세 내용

### 인증 정보 구분

- PEM 키: Lightsail SSH 접속에 사용
- PostgreSQL 비밀번호: `promise9` DB 사용자 인증에 사용

두 인증정보는 서로 다른 용도이며 repository에 저장하지 않습니다.

### 접속 경로

```text
pgAdmin
  → PEM 키로 Lightsail SSH 접속
  → Lightsail 내부 127.0.0.1:5432
  → PostgreSQL promise9
```

### 제공하는 접속 방법

1. pgAdmin Desktop의 내장 SSH Tunnel 사용
2. 터미널에서 `127.0.0.1:15432` 터널을 연 뒤 pgAdmin으로 접속

실제 PEM과 도메인을 사용한 SSH 터널 및 운영 DB 연결을 확인했습니다.
Markdown 포맷과 이미지 링크 경로도 검증했습니다.
