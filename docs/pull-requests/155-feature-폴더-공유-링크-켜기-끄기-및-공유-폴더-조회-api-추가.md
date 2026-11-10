# PR #155: [feature] 폴더 공유 링크 켜기, 끄기 및 공유 폴더 조회 API 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/155
- Author: @Choi-JY1107
- Base: main
- Head: feat/shared-folder
- Merged: 2026-11-10T05:44:32Z

## PR Body

## 📌 개요
- 폴더를 다른 사람과 링크로 공유하는 기능을 추가합니다.
- 폴더 주인이 공유를 켜면 무작위 토큰이 만들어지고, 로그인 없이 그 토큰으로 폴더의 링크 목록을 읽기 전용으로 볼 수 있습니다.
- 공유를 끄면 토큰이 지워져 기존 링크가 바로 막힙니다.

## ✅ 작업 내용 및 변경 사항
- [x] folders 테이블에 share_token(varchar 32, 비어 있을 수 있음), shared_at 열과 folders_share_token_idx 고유 색인 추가 (마이그레이션 0015)
- [x] 공유 켜기 PUT /folders/:folderId/share, 끄기 DELETE /folders/:folderId/share 추가 (로그인 필요, 끄기는 204)
- [x] 공유 폴더 읽기 GET /shared-folders/:shareToken 추가 (로그인 불필요, 읽기 전용, 커서 방식으로 나눠 조회)
- [x] 폴더 상세 응답에 shareToken, sharedAt 추가
- [x] 존재하지 않거나 꺼진 토큰, 삭제된 폴더는 SHARE_NOT_FOUND(404)로 응답

## 💬 리뷰어에게


## 🔍 상세 내용
- 토큰 발급은 share_token IS NULL인 행만 갱신하는 UPDATE로 해서, 동시에 두 번 켜도 토큰이 덮어써지지 않습니다.
- 공유 끄기는 토큰과 shared_at을 null로 되돌립니다. 다시 켜면 새 토큰이 만들어집니다.
- 공유 조회는 폴더 주인의 id로 기존 링크 목록 조회를 재사용하고, 저장 시각 내림차순, 삭제되지 않은 링크만 반환합니다.
- 배포 주의: 마이그레이션은 배포 워크플로에서 자동 실행되지 않습니다. 새 열만 더하는 변경이라, 머지 전에 APP_ENV=production bun run db:migrate를 백업 후 먼저 적용해야 새 코드가 없는 열을 읽다가 실패하지 않습니다.
- 시험: 단위 시험 760개 통과. 일회용 Postgres에 마이그레이션 전체 적용과 drizzle-kit check 통과. e2e 시험은 돌리지 못했습니다.
