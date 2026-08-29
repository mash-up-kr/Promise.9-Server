# PR #97: [feature] 링크 분석에 대표 이미지 색상 추출 연결

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/97
- Author: @vcz-Chan
- Base: main
- Head: feature/link-image-color-analysis
- Merged: 2026-08-28T17:54:34Z

## PR Body

## 📌 개요

운영 흐름에서 사용되지 않던 `ImageColorService`를 링크 저장 후 비동기 분석 파이프라인에 연결합니다.

원문 수집 과정에서 `og:image` 또는 `twitter:image`를 함께 찾고 대표 색상을 추출해 `links.metadata.images`에 저장합니다. 링크 저장 API는 분석 완료를 기다리지 않고 기존처럼 즉시 응답합니다.

## ✅ 작업 내용 및 변경 사항

- [x] `LinkModule`에 `ImageColorModule` 연결
- [x] 기존 원문 HTML 요청을 재사용해 대표 이미지 URL과 출처 수집
- [x] `og:image` → `twitter:image` 순으로 대표 이미지 선택
- [x] 상대 이미지 URL을 최종 페이지 URL 기준의 절대 URL로 변환
- [x] AI 요약·태그 처리와 이미지 색상 추출을 병렬 실행
- [x] 이미지 URL·출처·대표 색상을 `metadata.images[0]`에 저장
- [x] 색상 추출 실패 시 이미지 URL과 기존 메타데이터 보존
- [x] 이미지 실패를 전체 `processingStatus=FAILED` 사유에서 제외
- [x] 수집·메타데이터 병합·실패 정책 회귀 테스트 추가
- [x] API·ERD·DB·링크 저장 정책 문서 갱신

## 💬 리뷰어에게

다음 부분을 중점적으로 확인해 주세요.

- 링크 저장 응답이 이미지 분석을 기다리지 않는지
- 임베딩은 기존처럼 요약·태그 완료 후 실행되는지
- 이미지 색상 실패가 전체 분석 상태에 영향을 주지 않는지
- 색상 갱신 시 favicon·이미지 크기·다른 이미지 후보가 보존되는지

이미지 다운로드는 기존 `ImageFetcherService`를 사용하므로 SSRF 검증, 리다이렉트 재검증, 응답 크기 및 타임아웃 제한을 그대로 적용합니다.

현재 분석은 기존과 동일하게 서버 프로세스 내부의 fire-and-forget 방식으로 실행하며, 이번 PR에서는 큐·Worker·재시도 구조를 변경하지 않습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### 처리 흐름

링크를 DB에 저장한 뒤 API는 기존처럼 `201` 응답을 즉시 반환합니다. 이후 기존 비동기 분석 과정에서 원문 정보와 대표 이미지 URL을 저장하고, AI 요약·태그와 이미지 색상 추출을 병렬로 실행합니다.

임베딩은 최신 요약·태그가 저장된 뒤 생성하며, 이미지 작업 종료 후 `processingStatus`를 확정합니다. 추후 기존 비동기 분석을 Job 또는 Worker로 전환할 때 이미지 색상 추출도 함께 이전 대상에 포함하면 됩니다.

### 이미지 저장 및 실패 정책

| 상황 | 처리 |
| --- | --- |
| `og:image` 존재 | 대표 이미지로 선택 |
| `og:image` 없음 | `twitter:image` 사용 |
| 대표 이미지 없음 | 색상 추출 생략 |
| 이미지 다운로드·색상 분석 실패 | URL·출처 보존, warning 기록 |
| AI 요약·태그·임베딩 성공 | `processingStatus=SUCCESS` |

기존 `metadata.version=1` 구조를 사용하며, `dominantColor`에는 `ImageColorService`가 선택한 최종 대표 색상의 hex 값을 저장합니다.

```json
{
  "version": 1,
  "images": [
    {
      "url": "https://example.com/og.png",
      "source": "og:image",
      "dominantColor": "#a0d4fc"
    }
  ]
}
```

색상 저장 시 `metadata` 전체를 교체하지 않고 동일 URL의 이미지 항목만 갱신합니다. 기존 `description`, `faviconUrl`, 이미지 크기와 다른 이미지 후보는 보존합니다.

### API·DB 영향

- 링크 저장 API 응답 shape 변경 없음
- 링크 목록·상세의 기존 `thumbnailUrl` 계약 유지
- 기존 `links.metadata` JSONB 구조 사용
- DB 마이그레이션 없음

### 검증

- Jest: 24 suites / 145 tests 통과
- TypeScript 빌드 통과
- ESLint 및 diff 검사 통과
- 실제 Toss 링크에서 OG 이미지와 대표 색상 `#a0d4fc` 추출 확인
- 로컬 환경에서 이미지 색상 추출 약 115ms
