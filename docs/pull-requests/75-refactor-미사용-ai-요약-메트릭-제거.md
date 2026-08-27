# PR #75: [refactor] 미사용 AI 요약 메트릭 제거

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/75
- Author: @vcz-Chan
- Base: main
- Head: agent/remove-ai-summary-metrics
- Merged: 2026-08-25T15:57:17Z

## PR Body

## 📌 개요

런타임에서 사용하지 않는 레거시 `ai_summary_metrics` 테이블과 Drizzle 스키마를 제거합니다. 현재 AI 호출 관측 데이터는 기존과 동일하게 `ai_metrics`에 기록되며, 해당 흐름은 변경하지 않습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `ai_summary_metrics` Drizzle 스키마 및 통합 schema export 제거
- [x] `DROP TABLE "ai_summary_metrics"` 마이그레이션과 snapshot 추가
- [x] ERD와 링크 테이블 문서를 실제 사용 중인 `ai_metrics` 기준으로 정정

## 💬 리뷰어에게

- 저장소 전체를 확인한 결과 `ai_summary_metrics`를 조회하거나 기록하는 런타임 코드는 없고, 현재 메트릭 기록은 `AiMetricRepository`와 `ai_metrics`를 사용합니다.
- 현재 설정된 DB에서 `ai_summary_metrics`는 0건, `ai_metrics`는 202건임을 확인했습니다. 다만 개발/운영 환경 변수가 동일한 URL을 가리키므로 서로 다른 운영 DB까지 독립적으로 확인한 결과는 아닙니다.
- 예상치 못한 DB 의존성이 있다면 배포 단계에서 드러나도록 `DROP TABLE`에 `CASCADE`를 사용하지 않았습니다.
- 병렬 마이그레이션 PR이 먼저 병합되면 main 기준으로 migration 번호와 snapshot을 다시 생성해야 합니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

레거시 `ai_summary_metrics`와 현재 사용 중인 `ai_metrics`가 동시에 스키마에 남아 있었지만, 애플리케이션은 AI 요약·태그 호출 결과를 `ai_metrics`에만 저장합니다. 이 PR은 사용되지 않는 테이블 정의와 실제 DB 테이블을 제거하고, 문서가 현재 데이터 흐름을 설명하도록 맞춥니다.

검증:

- `bun run test -- --runInBand` — 15 suites, 95 tests 통과
- `bun run build` 통과
- `bun run lint` 통과
- `bun x drizzle-kit check` 통과
- `git diff --check` 통과

배포 시 마이그레이션 적용 전에 대상 환경에서 `ai_summary_metrics`가 비어 있고 외부 의존성이 없는지 한 번 더 확인해야 합니다.
