# PR #142: [fix] 2차 UT 노드팀 피드백 반영: 목록 processingStatus 추가, URL 정규화 강화, AI 요약 한국어 검사

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/142
- Author: @Choi-JY1107
- Base: main
- Head: feat/node-feedback-2026-09-12
- Merged: 2026-09-11T17:36:08Z

## PR Body


## 📌 개요
2차 UT 이슈 트래커에서 Node 담당 항목 중 서버만으로 완전히 해결할 수 있는 3건을 반영합니다. 목록 API에 처리 상태를 내려주고, 공유 파라미터가 다른 같은 링크가 중복 저장되던 문제를 고치고, AI 요약에 깨진 글자나 외국 문자가 섞여 저장되지 않게 막습니다. 이슈별 정리와 미해결 항목의 이유는 `docs/feedback/2026-09-12-node-feedback.md`에 있습니다.

## ✅ 작업 내용 및 변경 사항
- [x] `GET /links` 목록·검색 응답의 각 항목에 상세와 같은 `processingStatus`(`PENDING`, `SUCCESS`, `FAILED`) 추가
- [x] 검색 후보 조회에 `aiSummaryStatus` 컬럼 포함, 잘못 선언되어 있던 목록 `score` 필드를 목록 항목 DTO로 이동
- [x] URL 중복 판단 키에서 `utm_*`, `fbclid`, `igsh`, `igsi`, `img_index`, YouTube `si`·`feature` 등 추적·공유 파라미터 제거 후 나머지 정렬
- [x] 쿼리가 있어도 경로 끝 `/` 제거, Instagram 게시물은 `https://www.instagram.com/{p|reel|tv}/{shortcode}`로 통일
- [x] 기존 링크의 `normalized_url`을 새 규칙으로 다시 계산하는 `db:backfill:normalized-urls` 스크립트 추가 (dry-run 지원, 충돌 행은 건너뛰고 목록 출력)
- [x] AI 요약·태그를 NFC로 정규화하고 결합되지 않은 한글 자모나 한자·일본어·키릴 문자가 남으면 재시도 가능한 실패로 처리
- [x] 요약·태그 프롬프트에 한국어 외 문자 체계 금지 규칙 추가
- [x] API 문서, 링크 저장 정책, 테이블 문서, AI 사용 가이드 갱신 및 피드백 처리 결과 문서 추가

## 💬 리뷰어에게
- `processingStatus`는 필드 추가만이라 기존 앱과 호환됩니다. 웹은 현재 "제목이 비어 있고 저장 후 2분 이내"로 처리 중을 판단하고 있는데, 이 값의 `PENDING` 여부로 바꿀 수 있습니다.
- 정규화 규칙 변경은 새로 저장되는 링크에만 적용되므로 기존 링크는 백필이 필요합니다. 운영에서 dry-run 결과 활성 링크 898개 중 159개가 변경 대상이었고 충돌 1건(같은 사용자가 같은 게시물을 두 번 저장)은 건너뛰었습니다. 백필은 이미 적용했고, 배포 후 그 사이 저장된 링크를 위해 한 번 더 실행할 예정입니다.
- 한국어 검사는 한자·일본어·키릴 등 다른 문자 체계가 한 글자라도 있으면 재생성합니다. 프롬프트에 고유명사는 음차나 영어 표기로 쓰도록 지시했고, 실제 링크 4건(Instagram 2, YouTube, 토스 테크)에서 오탐 없이 통과했습니다. 재시도 상한은 기존 분석 재시도 정책(최대 4회)을 따릅니다.
- 이번 PR에서 제외한 항목: 제목 없이 요약만 노출(이미지까지 해결 불가), 특정 계정 썸네일 누락(운영 DB 확인 필요), 썸네일 속 글자 검색(OCR 필요), Apple revoke(환경변수·기존 회원 처리 결정 필요). 사유는 피드백 문서 4절에 있습니다.

## 🔗 관련 이슈
close #

## 🔍 상세 내용

### 목록 processingStatus
- `LinkListItemDto`에 `processingStatus`를 추가하고 `LinkService.toListItems`에서 `toProcessingStatus(row.aiSummaryStatus)`로 채웁니다. 상세와 같이 `NEEDS_REVIEW`는 `SUCCESS`로 감춥니다.
- 일반 목록은 이미 전체 컬럼을 조회하고 있어 쿼리 변경이 없습니다. 검색 경로는 `SearchRepository.findCandidates`의 select와 `SearchLinkCandidate`, `SearchResultRow` 타입에 `aiSummaryStatus`를 추가했습니다.

### URL 정규화
- `normalizeUrl`(`link.util.ts`)이 중복 판단 키를 만듭니다. 기존에는 프로토콜·호스트 소문자화, fragment 제거, 문자열 끝 `/` 제거만 했고 쿼리 파라미터는 손대지 않았습니다. 그래서 `/p/X/?img_index=1&igsi=...`와 `/p/X`가 다른 키가 되어 같은 게시물이 두 번 저장됐습니다.
- 변경 후 규칙: fragment 제거 → 프로토콜·호스트 소문자 → Instagram 게시물이면 shortcode 고정 형태로 반환 → 경로 끝 `/` 제거 → 추적 파라미터 제거와 이름순 정렬. 의미 있는 파라미터(YouTube `v`, `t` 등)는 유지합니다.
- 백필 스크립트는 활성 링크를 200건씩 순회하며 `original_url`로 새 키를 계산하고, 같은 사용자 안에 이미 새 키를 쓰는 활성 링크가 있으면 유니크 인덱스 충돌을 피해 건너뛰고 ID를 출력합니다. `updated_at`은 갱신하지 않아 정렬에 영향이 없습니다.

### AI 요약 한국어 검사
- `checkKoreanText`(`ai-link-analysis.language.ts`)가 텍스트를 NFC로 합친 뒤 한글 자모 범위(U+1100–U+11FF 등)와 `\p{Script=Han}` 같은 문자 체계를 검사합니다. 로그에는 문제 문자 앞뒤 몇 글자만 남기고 요약 전체는 남기지 않습니다.
- `AiService.generateLinkAnalysis`가 요약과 각 태그에 검사를 적용하고, 실패하면 `AI_GENERATED_TEXT_NOT_KOREAN` 코드의 `AiGenerationError(retryable: true)`를 던집니다. 분석 파이프라인의 `classifyFailure`가 이 값을 그대로 신뢰해 재시도합니다.
- 프롬프트는 기존 `link_analysis_v1`을 그대로 쓰되 `[summary]`와 `[tags]` 블록에 다른 문자 체계 금지 규칙을 한 줄씩 추가했습니다.

### 검증
- 단위 테스트 633개 통과, 타입 체크와 lint 통과.
- 운영 DB dry-run: 활성 링크 898개, 변경 대상 159개, 충돌 1건.
- 실제 링크로 AI 요약 생성 후 한국어 검사 통과 확인: Instagram 게시물 2건, YouTube 영상 1건, 토스 테크 1건.
