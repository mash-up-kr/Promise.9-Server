# PR #104: [feature] 리마인드 시간에 인덱스 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/104
- Author: @ninaxlee
- Base: main
- Head: feature/reminder-index
- Merged: 2026-09-05T16:15:41Z

## PR Body

## 📌 개요
15분 주기 리마인드 배치가 발송 대상 링크를 효율적으로 조회할 수 있도록 부분 인덱스를 추가합니다.

## ✅ 작업 내용 및 변경 사항
- [x] reminder_at 기반 부분 인덱스 추가
- [x] 삭제되지 않고 reminder_at이 설정된 링크만 인덱싱
- [x] Drizzle 0010 migration 및 snapshot 생성
- [x] Drizzle metadata를 generated diff로 표시

## 💬 리뷰어에게
- AI 추천으로 넣긴 넣었는데 사실 지금 단계에서는 굳이? 싶은 부분이라 빼도 됩니다

## 🔍 검증
- 전체 테스트 185개 통과
- build, lint 통과
