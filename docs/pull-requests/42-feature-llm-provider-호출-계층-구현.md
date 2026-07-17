# PR #42: [feature] LLM provider 호출 계층 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/42
- Author: @vcz-Chan
- Base: main
- Head: feat/llm-providers
- Merged: 2026-07-16T11:07:07Z

## PR Body

## 📌 개요

OpenAI와 Gemini SDK를 공통 LLM 계층으로 연결하고, 호출자가 provider를 알지 않아도 model만 선택해 text 또는 structured object를 생성할 수 있도록 구현했습니다.
provider별 요청/응답과 오류는 infrastructure 계층에서 정규화합니다.

## ✅ 작업 내용 및 변경 사항

- [x] OpenAI Responses API 및 Gemini generateContent 연동
- [x] model 기반 provider 라우팅과 기본 model 설정
- [x] text/object 생성 인터페이스 및 공통 generation options 제공
- [x] structured output JSON 변환과 최종 Zod 검증
- [x] provider/configuration/response parse 오류 구분 및 cause 보존
- [x] LLM service와 provider 단위 테스트 추가

## 💬 리뷰어에게

- 호출부에는 provider가 아니라 model만 노출하는 경계를 중점적으로 봐주세요.
- provider 공통 옵션은 `temperature`, `maxOutputTokens`, `topP`만 노출했습니다.
- structured output은 provider schema 적용 후 JSON parse와 호출자 Zod schema 검증을 다시 수행합니다.

## 🔗 관련 이슈

관련 이슈 없음

## 🔍 상세 내용

```text
호출부
  -> LlmService
      -> model-provider resolve
      -> OpenAIProvider 또는 GeminiProvider
      -> text/object 결과 정규화
```

검증:
- `bun run lint`
- `bun run test` (53 tests)
- `bun run build`
- OpenAI/Gemini text 및 structured output 실제 호출 확인
