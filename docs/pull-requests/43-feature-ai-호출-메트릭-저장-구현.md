# PR #43: [feature] AI 호출 메트릭 저장 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/43
- Author: @vcz-Chan
- Base: main
- Head: feat/ai-metrics
- Merged: 2026-07-17T02:03:45Z

## PR Body

## 📌 개요

LLM 호출 결과를 공통 형식으로 기록할 수 있도록 `ai_metrics` schema, migration, 저장 서비스를 추가했습니다.
요약과 태그 등 여러 AI task의 성공·실패 결과를 append-only metric으로 관리합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `ai_metrics` Drizzle schema와 migration 추가
- [x] 성공/실패 metric 입력을 구분하는 타입 정의
- [x] LLM 호출 결과를 append-only row로 저장
- [x] 동일 작업의 호출·재시도 횟수를 누적 metric row 개수로 추정
- [x] 성공 결과와 실패 오류 정보 저장
- [x] metric service 단위 테스트 및 database 문서 추가
- [x] 공통 `ai_metrics` 테이블 문서화

## 💬 리뷰어에게

- `ai_metrics`가 비즈니스 상태가 아닌 LLM 호출 결과 로그라는 경계를 중점적으로 봐주세요.
- 동일한 `userLinkId + taskType`의 호출·재시도 횟수는 저장된 metric row 개수로 추정합니다.
- 성공·실패 횟수는 `status` 조건을 포함해 집계할 수 있습니다.
- 생성 결과는 성공일 때만, 오류 코드와 메시지는 실패일 때만 저장합니다.

## 🔗 관련 이슈

- 선행 PR: #42
- 스택 순서: #42 → #43

## 🔍 상세 내용

```text
AiMetricService.record
  -> 성공/실패 입력을 ai_metrics row로 변환
  -> ai_metrics insert
```

검증:
- `bun run lint`
- `bun run test` (56 tests)
- `bun run build`
