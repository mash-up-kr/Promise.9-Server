# PR #71: [feature] 링크 분석 완료 후 임베딩 생성

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/71
- Author: @vcz-Chan
- Base: main
- Head: feature/link-analysis-embedding
- Merged: 2026-08-21T09:57:05Z

## PR Body

## 📌 개요

링크 저장 직후 불완전한 정보로 임베딩하던 흐름을 비동기 분석 완료 시점으로 옮깁니다.
임베딩 대상은 `제목 + 태그 + AI 요약`으로 통일하고, 기존 링크를 같은 규칙으로 갱신할 수 있는 백필 옵션을 추가합니다.

## ✅ 작업 내용 및 변경 사항

- [x] AI 요약과 태그 처리가 끝난 뒤 최신 DB 값으로 임베딩 생성
- [x] 임베딩 대상에서 수정 가능한 메모·도메인·description을 제외하고 태그 추가
- [x] 임베딩 원본 조회와 저장을 기존 `LinkRepository`에 통합
- [x] 요청 사용자의 활성 링크에만 임베딩 저장
- [x] 요약·태그·임베딩이 모두 성공한 뒤에만 전체 분석을 `SUCCESS` 처리
- [x] 부분 실패 시 성공한 요약·태그 결과는 보존하고 전체 상태는 `FAILED` 처리
- [x] 활성 링크 UPDATE가 0건이면 임베딩 실패로 판정
- [x] 기존 링크 백필에 사용자 범위·상태 조회·dry-run·강제 갱신 옵션 추가
- [x] 백필의 조건부 UPDATE가 실제 갱신한 행만 처리 완료 건수로 집계
- [x] 분석 순서, 원본 조립, 저장 실패 회귀 테스트 추가

## 💬 리뷰어에게

임베딩 생성 시점이 요약·태그 처리 이후로 보장되는지와, 요약·태그·임베딩 세 단계가 모두 성공한 뒤에만 전체 분석 상태가 `SUCCESS`가 되는지 중점적으로 확인해 주세요.
백필은 기본적으로 `embedding IS NULL`인 활성 링크만 처리하며, 기존 벡터를 새 규칙으로 교체할 때만 `--force-refresh`를 사용합니다.
백필 진행 건수는 시도한 대상 수가 아니라 `UPDATE ... RETURNING`으로 실제 갱신된 행 수를 합산합니다.
`--force-refresh`에는 checkpoint나 시작 id 옵션이 없으므로 중간 실패 후 재실행하면 처음부터 다시 처리합니다. API 비용이 큰 전체 백필은 `--user-id`와 `--dry-run`으로 범위를 먼저 확인해 주세요.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### 임베딩 원본

아래 필드를 순서대로 줄바꿈 결합하며 빈 값은 제외합니다.

```text
title
tags (sortOrder, id 순)
aiSummary
```

메모는 사용자가 자주 수정할 수 있고 관련 링크의 의미 자체를 대표하지 않으므로 임베딩 대상에서 제외합니다. 메모는 검색의 키워드 신호에는 계속 포함됩니다.

### 생성 흐름

```text
링크 저장
→ 원문 정보 저장
→ AI 요약·AI 태그 병렬 처리 완료
→ 최신 활성 링크와 태그 조회
→ 임베딩 생성
→ 활성 링크에 임베딩 저장
→ 세 단계 결과로 processingStatus 확정
```

`LinkRepository.updateEmbedding()`은 `userId`, `linkId`, 활성 상태를 확인해 저장합니다. 임베딩 생성 중 링크가 삭제돼 UPDATE 대상이 없으면 임베딩 실패로 처리합니다. 현재 수정 가능한 필드는 임베딩 원본에 포함되지 않으므로 별도의 원본 동등성 비교는 두지 않습니다.

### 실패 처리

요약·태그는 병렬로 모두 시도하고, 한쪽이 실패해도 저장된 부분 결과로 임베딩을 시도합니다. 세 단계가 모두 성공해야 `processingStatus=SUCCESS`가 되며, 하나라도 실패하면 부분 결과를 유지한 채 `FAILED`로 기록합니다.

```text
요약 성공 + 태그 성공 + 임베딩 성공 → SUCCESS
세 단계 중 하나라도 실패              → FAILED (성공한 부분 결과는 보존)
```

### 기존 데이터 갱신

```bash
bun run db:backfill:embeddings -- --user-id=<id> --status
bun run db:backfill:embeddings -- --user-id=<id> --force-refresh --dry-run
bun run db:backfill:embeddings -- --user-id=<id> --force-refresh
```

- 배치 크기: 32개
- 기본 모드: 임베딩이 없는 활성 링크만 생성
- `--force-refresh`: 기존 임베딩도 새 원본 규칙으로 교체
- 새 규칙에서 원본이 비어 있으면 기존 벡터를 `null`로 정리

### API·DB 영향

- API 응답 shape은 유지하되 `processingStatus`를 요약·태그·임베딩 전체 처리 상태로 확장합니다.
- `links.embedding` 컬럼과 pgvector 설정은 기존 구조를 그대로 사용합니다.
- 마이그레이션은 추가하지 않습니다.

### 검증

- targeted Jest: 3 suites / 12 tests
- `bun run build`
