# AI 생성 흐름 상세

이 문서는 `AiService`, `LlmService`, provider, metrics 사이의 내부 흐름을 설명한다.
AI 기능을 사용하는 방법은 [AI 사용 가이드](./usage.md)를 참고한다.

## 역할

| 위치                                 | 책임                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `src/modules/ai/ai.service.ts`       | 도메인별 public AI 유스케이스, prompt/schema/model 선택, LLM 호출과 metrics 조율 |
| `src/modules/ai/metrics`             | `ai_metrics` schema와 append-only 저장                                           |
| `src/infrastructure/llm`             | model 라우팅, text/object 생성, JSON parse와 Zod 검증, 공통 LLM 오류             |
| `src/infrastructure/llm/providers/*` | provider SDK 요청 생성과 응답 정규화                                             |
| `src/common/constants/llm.ts`        | 애플리케이션에서 선택할 수 있는 model 목록                                       |

`AiService`는 AI 전용 정책만 담당한다.
권한 검증, 도메인 상태 변경, 생성 결과 저장은 해당 데이터를 소유한 모듈이 담당한다.

## 외부 경계

다른 모듈에는 `generateSummary`, `generateTags` 같은 도메인별 public AI 유스케이스만 공개한다.
generic `generateText`, `generateObject`는 private로 유지한다.

```text
도메인 서비스
  -> AiService의 도메인별 public AI 유스케이스
      -> private generateText 또는 generateObject
          -> LlmService
              -> OpenAIProvider 또는 GeminiProvider
          -> AiMetricService.record
  <- 생성 결과
  -> 도메인 데이터에 결과 반영 및 저장
```

이 경계를 유지하면 호출부가 provider와 metrics 저장 방식을 알 필요가 없고, metrics가 누락되는 별도 LLM 호출 경로도 생기지 않는다.

## LLM 호출 흐름

`generateText`와 `generateObject`는 다음 순서로 동작한다.

1. 입력 model 또는 `LLM_DEFAULT_MODEL`로 provider를 결정한다.
2. model, provider, options가 확정된 resolved target을 만든다.
3. 같은 resolved target을 실제 provider 호출과 metrics 기록에 사용한다.
4. provider 응답의 model, token 사용량, TTLB를 공통 결과로 변환한다.
5. 성공 또는 실패 결과를 `ai_metrics`에 기록한다.

호출부는 model만 선택한다. `LLM_MODEL_PROVIDER`가 OpenAI 또는 Gemini provider를 결정한다.

### Text

`generateText`는 provider가 반환한 문자열을 그대로 반환하고 metrics의 `generatedResult`에도 문자열로 저장한다.

### Object

`generateObject`는 다음 검증 단계를 추가로 거친다.

1. Zod schema를 provider에 전달할 JSON Schema로 변환한다.
2. provider structured output을 요청한다.
3. 응답 문자열을 `JSON.parse`한다.
4. 원래 Zod schema로 최종 검증한다.

provider의 schema 지원 범위와 관계없이 최종 반환 계약은 4단계의 Zod 검증이 보장한다.

## Metrics 기록 흐름

metrics 저장은 LLM 결과를 관찰하기 위한 부가 작업이다. 저장 실패가 원래 생성 결과나 오류를 변경해서는 안 된다.

### 성공

```text
provider 성공
  -> text 또는 검증된 object 생성
  -> SUCCESS metric 저장
  -> 생성 결과 반환
```

저장 필드:

- `status = SUCCESS`
- 선택한 provider와 model
- input/output token
- TTLB
- text 문자열 또는 검증된 object
- 선택적인 `promptKey`

metrics 저장이 실패하면 오류 종류만 로그로 남기고 생성 결과는 그대로 반환한다.

### Provider 호출 이후 실패

```text
provider 또는 응답 처리 실패
  -> 오류 코드와 메시지 정규화
  -> FAILED metric 저장
  -> AiGenerationError 발생
```

provider SDK 오류, JSON parse 오류, Zod 검증 오류는 실패 metric 대상이다.

### Provider 호출 전 실패

```text
API key·model·schema 변환 오류
  -> metric을 저장하지 않음
  -> AiGenerationError 발생
```

provider 요청이 시작되지 않은 `LlmConfigurationError`는 LLM 호출 결과가 아니므로 기록하지 않는다.

### 호출 횟수

동일 작업의 호출·재시도 횟수는 `userLinkId + taskType` 조건으로 저장된 metric row 개수를 집계해 추정한다.
정확한 비즈니스 retry 실행 단위가 필요하면 별도 실행 식별자를 사용해야 한다.

## 오류 경계

| 오류                    | 발생 위치 | 역할                                                              |
| ----------------------- | --------- | ----------------------------------------------------------------- |
| `LlmConfigurationError` | LLM 계층  | API key, model mapping, schema 변환 등 provider 호출 전 설정 오류 |
| `LlmProviderError`      | provider  | SDK/API 실패를 provider, code, status, cause와 함께 보존          |
| `LlmResponseParseError` | LLM 계층  | structured output을 JSON으로 해석하지 못한 오류                   |
| `z.ZodError`            | LLM 계층  | parsing된 object가 호출자의 schema를 만족하지 못한 오류           |
| `AiGenerationError`     | AI 계층   | 내부 오류를 AI 유스케이스 호출자에게 전달하는 공통 오류           |

`AiGenerationError.cause`에는 원본 오류를 보존한다.
metrics에는 정규화한 오류 코드와 메시지만 저장한다.

## 확장 기준

- 도메인별 public AI 유스케이스: `AiService`에 public method와 실제 입력/출력 타입을 추가한다.
- metrics 작업 종류: `AI_TASK_TYPE`을 추가한다.
- model: `LLM_MODEL`, `LLM_MODEL_PROVIDER`, 관련 테스트를 갱신한다.
- provider: `LlmProvider` 구현과 `LlmModule` provider 등록을 추가한다.
- provider 특수 옵션: 실제 유스케이스가 요구할 때만 공통 입력 타입과 provider 변환을 함께 확장한다.

## Provider 설정

- `LLM_REQUEST_TIMEOUT_MS`는 provider SDK의 HTTP timeout에 전달한다.
- OpenAI는 `maxRetries = 1`로 설정한다.
- Gemini는 원 요청을 포함해 최대 2회 시도한다.

관련 SDK 동작은 [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)와 [Gemini generateContent API](https://ai.google.dev/api/generate-content)를 참고한다.
