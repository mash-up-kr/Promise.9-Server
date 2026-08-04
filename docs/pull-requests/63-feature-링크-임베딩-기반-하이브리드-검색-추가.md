# PR #63: [feature]: 링크 임베딩 기반 하이브리드 검색 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/63
- Author: @Choi-JY1107
- Base: main
- Head: feature/search
- Merged: 2026-08-04T05:31:59Z

## PR Body

## 📌 개요

OpenAI 임베딩과 pgvector를 활용한 링크 의미 검색을 추가했습니다.

## ✅ 작업 내용 및 변경 사항

```text
코사인 유사도 = 1 - cosineDistance(링크 임베딩, 검색어 임베딩)

검색 점수 = min(1, 코사인 유사도 + (키워드 일치 여부 × 0.3))
```

## 💬 리뷰어에게

키워드 가산점과 벡터 유사도를 결합한 검색 점수 정책을 중점적으로 확인해 주세요.
임베딩 생성은 링크 저장을 막지 않는 best-effort 방식이며, 기존 데이터는 백필 스크립트로 처리합니다. (머지 후 처리 예정)

## 🔗 관련 이슈

close #

## 🔍 상세 내용

- 임베딩 모델: `text-embedding-3-large`
- 벡터 차원: 768
- 임베딩 대상 텍스트: `title`, `aiSummary`, `memo`, `domain`, `metadata.description`을 줄바꿈으로 이어붙입니다. (빈 값은 제외)
    - 링크 저장 직후에는 제목·요약·메타데이터가 아직 비어 있어 `domain`(+`memo`) 위주로만 임베딩됩니다. 메타데이터·요약 수집이 붙으면 재임베딩합니다.
- 검색 후보: 키워드·벡터 각각 최대 50개
- 검증 완료
  - lint 통과
  - TypeScript 빌드 통과
  - 전체 테스트 83개 통과
