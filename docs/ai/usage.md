# AI 사용 가이드

`AiService`는 요약, 태그 생성 같은 도메인별 public AI 유스케이스를 제공한다.
도메인별 public AI 유스케이스는 각 도메인 모듈이 호출하는 `AiService`의 공개 기능을 뜻한다.
각 도메인 모듈은 `LlmService`를 직접 호출하지 않고 이러한 AI 유스케이스를 사용한다.

현재 `generateSummary`, `generateTags`는 구현 위치만 준비된 placeholder다.
실제 입력과 반환 타입은 각 유스케이스를 구현할 때 확정한다.

## 최종 구조

도메인에 AI 기능이 필요하면 `AiService`에 도메인별 public AI 유스케이스를 추가하고, 해당 도메인 모듈에서 이를 호출한다.

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

도메인별 public AI 유스케이스는 prompt, schema, model, text/object 방식, parsing, fallback과 품질 기준을 결정한다.
유스케이스가 private `generateText` 또는 `generateObject`를 사용하면 다음 처리는 공통으로 적용된다.

- model에 맞는 provider 선택과 LLM 호출
- provider timeout과 SDK retry
- model, token 사용량, TTLB 결과 정규화
- LLM 오류를 `AiGenerationError`로 변환
- 성공/실패 metrics 기록과 metrics 저장 실패의 best-effort 처리

도메인 모듈은 권한 확인, 대상 데이터 조회, AI 유스케이스 호출, 생성 결과의 도메인 반영과 저장을 담당한다.

## 외부 모듈에서 사용하기

사용하는 NestJS module에서 `AiModule`을 import한다.

```ts
@Module({
    imports: [AiModule],
    providers: [ExampleService],
})
export class ExampleModule {}
```

서비스에서는 `AiService`의 도메인별 public AI 유스케이스만 호출한다.

```ts
constructor(private readonly aiService: AiService) {}

const summary = await this.aiService.generateSummary(/* 확정된 input */)
```

호출하는 도메인 모듈은 권한 확인, 대상 데이터 조회, 결과 저장을 담당한다.
`AiService`는 prompt 구성, 모델 호출, 결과 검증 같은 AI 전용 정책을 담당한다.

## AI 유스케이스 구현하기

도메인별 public AI 유스케이스는 `AiService`에 public method로 추가한다.
LLM 응답 형태에 따라 private `generateText` 또는 `generateObject` 중 하나를 호출한다.

- `generateText`: 자유 형식 문자열이 필요하거나 유스케이스가 직접 parsing할 때 사용한다.
- `generateObject`: JSON 형태와 Zod schema 검증이 필요할 때 사용한다.

```ts
async generateSummary(input: SummaryInput) {
    const result = await this.generateText({
        userLinkId: input.userLinkId,
        taskType: AI_TASK_TYPE.SUMMARY_GENERATE,
        promptKey: 'summary_v1',
        system: '링크 내용을 짧고 정확하게 요약한다.',
        prompt: input.content,
    })

    return result.text
}
```

```ts
const tagResultSchema = z.object({
    tags: z.array(z.string()),
})

const result = await this.generateObject({
    userLinkId,
    taskType: AI_TASK_TYPE.TAG_GENERATE,
    promptKey: 'tags_v1',
    prompt,
    schema: tagResultSchema,
})

return result.data.tags
```

generic 실행기를 public으로 노출하거나 다른 모듈에서 `LlmModule`을 직접 import하지 않는다.
그래야 모든 애플리케이션 LLM 호출이 같은 오류 처리와 metrics 기록 경로를 거친다.

## 생성 입력

`generateText`와 `generateObject`가 공통으로 받는 값은 다음과 같다.

| 파라미터     | 필수       | 역할                                                                                                   |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| `userLinkId` | O          | 호출 대상 링크. `ai_metrics`를 링크와 연결할 때 사용한다.                                              |
| `taskType`   | O          | `SUMMARY_GENERATE`, `TAG_GENERATE` 같은 작업 구분값이다. metrics 분류와 object schema 이름에 사용한다. |
| `promptKey`  | X          | prompt 종류나 버전을 식별한다. 예: `summary_v1`                                                        |
| `system`     | X          | 모델의 역할과 공통 지침을 전달한다.                                                                    |
| `prompt`     | O          | 모델이 처리할 실제 요청 내용이다.                                                                      |
| `llm`        | X          | 기본 모델 대신 특정 모델과 공통 생성 옵션을 사용할 때 지정한다.                                        |
| `schema`     | object만 O | object 결과가 지켜야 할 Zod schema다.                                                                  |

`llm`을 생략하면 `LLM_DEFAULT_MODEL`을 사용한다. provider는 model에 따라 내부에서 결정된다.

```ts
llm: {
    model: LLM_MODEL.GEMINI_3_5_FLASH,
    options: {
        temperature: 0.2,
        maxOutputTokens: 256,
        topP: 0.9,
    },
}
```

| 옵션              | 역할                                            |
| ----------------- | ----------------------------------------------- |
| `temperature`     | 응답의 무작위성 정도를 조절한다.                |
| `maxOutputTokens` | 생성할 수 있는 최대 output token 수를 제한한다. |
| `topP`            | 누적 확률 기준으로 token 후보 범위를 제한한다.  |

provider별 특수 옵션은 노출하지 않는다. 실제 유스케이스에서 필요해질 때 공통 인터페이스에 추가한다.

## 생성 결과

text 결과에는 `text`, object 결과에는 `data`가 들어간다. 나머지 필드는 공통이다.

| 필드            | 역할                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| `text`          | `generateText`가 반환한 문자열이다.                                                 |
| `data`          | `generateObject`가 JSON parse와 Zod 검증을 마친 값이다.                             |
| `model`         | provider가 실제 응답에 사용한 모델이다.                                             |
| `usage`         | provider가 제공한 input/output token 사용량이다.                                    |
| `ttlbMs`        | LLM 호출부터 결과 검증 완료까지 걸린 시간이다.                                      |
| `status`        | 성공한 반환값에서는 `SUCCESS`다. 실패는 반환하지 않고 `AiGenerationError`를 던진다. |

## Object schema 작성

`generateObject`는 provider의 structured output을 사용한 뒤 `JSON.parse`와 Zod 검증을 다시 수행한다.

- 최상위 schema는 `z.object(...)`를 사용한다.
- 모든 필드는 required로 선언한다.
- 값이 없을 수 있는 필드는 `.optional()` 대신 `.nullable()`을 사용한다.

schema를 provider용 JSON Schema로 변환하지 못하면 호출 전에 `LlmConfigurationError`가 발생한다.
provider별로 지원하는 JSON Schema 세부 범위는 다를 수 있지만, 최종 반환값은 항상 전달한 Zod schema로 검증한다.

## Metrics 자동 기록

private `generateText` 또는 `generateObject`를 사용하면 별도 저장 코드 없이 `ai_metrics`가 기록된다.

| 결과                           | 기록 내용                                        |
| ------------------------------ | ------------------------------------------------ |
| text 성공                      | `SUCCESS`, 생성 문자열, 모델, token, TTLB        |
| object 성공                    | `SUCCESS`, 검증된 JSON 값, 모델, token, TTLB     |
| provider/parse/검증 실패       | `FAILED`, 오류 코드와 메시지, 모델, TTLB         |
| API key·model·schema 변환 오류 | provider 호출 전 설정 오류이므로 기록하지 않음   |
| metrics DB 저장 실패           | 로그만 남기고 원래 LLM 결과나 오류는 그대로 유지 |

동일 작업의 호출·재시도 횟수는 `userLinkId + taskType` 조건의 metrics row 개수를 집계해 추정한다.
metrics 저장에 실패해도 생성 결과는 정상 반환한다.

테이블 필드와 보관 기준은 [ai_metrics](../database/tables/ai_metrics.md) 문서를 참고한다.

## 오류

현재 AI 생성 실행 경로는 다음 공통 오류를 외부 호출자에게 전달한다.

- 구현되지 않은 도메인별 public AI 유스케이스: `AiUseCaseNotImplementedError`
- LLM 호출, JSON parse, 결과 검증 실패: `AiGenerationError`

내부 `LlmConfigurationError`도 `AiGenerationError`로 변환된다.
이 경우 `code`는 `LLM_CONFIGURATION_ERROR`이고 metrics를 기록하지 않는다.
