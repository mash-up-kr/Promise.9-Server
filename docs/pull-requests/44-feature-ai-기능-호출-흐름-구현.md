# PR #44: [feature] AI 기능 호출 흐름 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/44
- Author: @vcz-Chan
- Base: main
- Head: feat/ai-service
- Merged: 2026-07-17T02:04:02Z

## PR Body

## 📌 개요

도메인 모듈이 provider와 metrics 저장 방식을 알지 않고도 `AiService`의 도메인별 public AI 유스케이스를 호출할 수 있도록 공통 실행 계층을 추가했습니다.
`AiService`의 private `generateText`, `generateObject`가 LLM 호출, 오류 변환, 성공·실패 metrics 기록을 공통으로 처리합니다.

현재 `generateSummary`, `generateTags`는 실제 입력·출력 정책을 구현하기 전의 placeholder입니다.

## ✅ 작업 내용 및 변경 사항

- [x] 도메인별 public AI 유스케이스 진입점인 `AiService`와 `AiModule` 추가
- [x] text/object 생성을 위한 private 공통 실행기 구현
- [x] model 기준 target resolve와 provider 호출 결과 연동
- [x] 성공·실패 `ai_metrics` 자동 기록 및 best-effort 처리
- [x] LLM/configuration/Zod 오류를 `AiGenerationError`로 변환
- [x] configuration 오류의 metrics 제외 정책 적용
- [x] 생성 흐름과 오류 경계 단위 테스트 추가
- [x] AI 모듈 사용 가이드와 내부 생성 흐름 문서화

## 💬 리뷰어에게

- 도메인 모듈, `AiService`, `LlmService`, `AiMetricService` 사이의 책임 경계를 중점적으로 봐주세요.
- generic 실행기는 private로 유지하고, 다른 모듈에는 도메인별 public AI 유스케이스만 공개합니다.
- metrics 저장 실패가 원래 LLM 결과나 오류를 덮지 않는지 확인해주세요.
- `generateSummary`, `generateTags`의 실제 입력·출력 계약, prompt, 품질·반환 정책은 후속 작업에서 구현합니다.

추가로 같이 작업하고 싶은 부분 
1. 매트릭 또는 쌓인 데이터로 프롬프트, 모델 평가 체계 구축 -> 특히 recall(ex. 동일 프롬프트로 n번 실행시 태그의 recall 지표)
2. 서킷 브레이커(주식 아닙니다.) 특정 llm 프로바이더의 이상이 n번 이상 지속 될 경우 자동으로 다른 프로바이더로 변경 및 기본 모델 변결
3. fallback 모델 두기

정도 생각이 납니다요

프롬프트 캐싱의 경우 일단 최소 캐싱 단위(1024토큰)을 안 넘을 것 같아 추가 하지 않았습니다. 
추 후 프롬프트를 본 뒤에 하는 게 나을 것 같습니다. (고정 프롬프트나 프롬프트 순서를 보는 게 좋을 것 같아요)

## 🔗 관련 이슈

- 직접 선행 PR: #43
- 전체 스택: #42 → #43 → #44

## 🔍 상세 내용

### 문서 안내

- 사용법, 도메인별 public AI 유스케이스 추가 방법, 최종 호출 구조는 [`docs/ai/usage.md`](https://github.com/mash-up-kr/Promise.9-Server/blob/feat/ai-service/docs/ai/usage.md)에 문서화했습니다.
- 구현 구조, provider 호출, metrics 저장, 오류 변환의 내부 흐름은 [`docs/ai/generation-detail.md`](https://github.com/mash-up-kr/Promise.9-Server/blob/feat/ai-service/docs/ai/generation-detail.md)에 문서화했습니다.

### 최종 구조

```text
도메인 서비스
  -> AiService.generateSummary / generateTags / 새로운 public AI 유스케이스
      -> private generateText 또는 generateObject
          -> LlmService
              -> model에 맞는 OpenAIProvider 또는 GeminiProvider
          -> AiMetricService.record
  <- 생성 결과
  -> 도메인 데이터에 결과 반영 및 저장
```

도메인에 AI 기능이 필요하면 `AiService`에 도메인별 public AI 유스케이스를 추가하고, 해당 도메인 모듈에서 이를 호출합니다.

### 책임 구분

도메인별 public AI 유스케이스가 결정하는 항목:

- prompt와 `promptKey`
- schema와 text/object 호출 방식
- 사용할 model과 공통 generation options
- parsing, fallback, 품질 기준
- 호출자에게 반환할 결과

private `generateText` 또는 `generateObject`를 사용하면 자동 적용되는 항목:

- model에 맞는 provider 선택과 LLM 호출
- provider timeout과 SDK retry
- model, token 사용량, TTLB 결과 정규화
- LLM 오류를 `AiGenerationError`로 변환
- 성공·실패 metrics 기록
- metrics 저장 실패의 best-effort 처리

도메인 모듈이 담당하는 항목:

- 권한 확인
- 대상 데이터 조회
- AI 유스케이스 호출
- 생성 결과의 도메인 반영과 저장

### Text와 Object

- `generateText`: 자유 형식 문자열이 필요하거나 유스케이스가 직접 parsing할 때 사용합니다.
- `generateObject`: provider structured output과 Zod object schema 검증이 필요할 때 사용합니다.

`generateObject`는 provider 요청 이후에도 `JSON.parse`와 호출자가 전달한 Zod schema 검증을 수행합니다.

### Metrics와 오류

- 성공: 생성 결과, 요청 model/provider, token, TTLB를 `SUCCESS`로 기록합니다.
- provider/parse/Zod 실패: 오류 코드와 메시지를 `FAILED`로 기록한 뒤 `AiGenerationError`를 던집니다.
- API key, model mapping, schema 변환 등 `LlmConfigurationError`: 실제 LLM 호출 결과가 아니므로 metrics를 기록하지 않습니다.
- metrics DB 저장 실패: 오류 종류만 로그로 남기고 원래 생성 결과나 오류를 유지합니다.

### 검증

- `bun run lint`
- `bun run test -- --runInBand` (66 tests)
- `bun run build`
- Prettier 문서·코드 포맷 확인
