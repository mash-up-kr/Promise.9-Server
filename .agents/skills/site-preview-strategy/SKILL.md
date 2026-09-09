---
name: site-preview-strategy
description: Promise.9의 사이트별 링크 미리보기·본문·썸네일 수집 전략을 추가하거나 개선할 때 사용한다. 공개 embed·모바일 경로, robots 정책, 필요한 공식 API, TinyFish Fetch 응답을 비교해 과도한 필터 없이 대상 콘텐츠를 추출하고 검증한다.
---

# 사이트별 링크 수집 전략

목표는 입력한 링크의 제목·내용·이미지를 정확하게 얻는 것이다. 네이버·Instagram·YouTube·X에서 확인한 접근법을 출발점으로 삼되, 한 사이트의 URL·ID·CDN 규칙을 다른 사이트에 그대로 적용하지 않는다.

## 먼저 현재 구조 확인

레포 루트에서 `src/modules/link/content/README.md`와 작업 대상 코드를 읽는다. 문서와 코드가 다르면 차이를 명시한다.

- `strategy/site/`, `strategy/link-content-strategy.registry.ts`: 사이트 판별·등록·URL 정리·콘텐츠 정규화·이미지 선택
- `strategy/link-content-strategy.type.ts`: 현재 지원하는 훅과 수집 방식
- `html/`, `robots.parser.ts`, `tinyfish/`: 직접 HTML 수집·robots 판정·TinyFish 공통 요청/응답
- `link-content.service.ts`: preview와 collect의 실행 흐름·최종 URL 검증

기존 훅(`prepareUrl`, `fetchOptions`, `normalizeContent`, `selectImage`)을 우선 사용한다. 사이트 파싱은 전략에, 통신·오류 처리는 공통 클라이언트에 둔다. 공통 확장이 필요하면 이유를 설명한다. 기존 공개 URL·리다이렉트·timeout·응답 크기 제한은 유지한다.

## 1. 수집 경로 선택

1. 원본 공개 화면과 공유 링크를 확인한다. 공식 문서·페이지의 링크에서 `/embed`, captioned embed, 모바일 상세 페이지, canonical URL, oEmbed 후보를 찾는다. 경로 이름만 추측해 성공으로 간주하지 않는다.
2. 공개·허용된 후보에서 직접 HTML/OG 또는 oEmbed로 필요한 필드를 얻을 수 있는지 본다. embed도 렌더링이 필요할 수 있으므로 URL 선택과 수집 수단 선택을 구분한다.
3. HTML만으로 내용이 부족하거나 렌더링이 필요한 경우 같은 후보를 TinyFish Fetch로 비교한다. 요청마다 모든 경로를 순회하는 폴백 체인 대신, 조사로 가장 적합한 기본 경로를 정한다.
4. 사이트 특성상 공식 API가 유리하면 키·할당량·운영 비용과 필요한 필드를 비교해 사용한다. 모든 사이트에 별도 API를 도입하지 않는다.

경로 선택 예: 네이버 장소는 모바일 상세 페이지, Instagram 게시물·릴스는 `/{kind}/{shortcode}/embed/captioned/`를 TinyFish에 요청한다. 같은 콘텐츠의 원본·embed·모바일 URL을 바꿔 넣고 필요한 내용·이미지와 시간을 비교한다.

YouTube는 preview에 oEmbed, 설명이 필요한 collect에 Data API를 쓰는 사이트별 예외다. [videos.list 공식 문서](https://developers.google.com/youtube/v3/docs/videos/list)와 필요한 필드·할당량을 확인하며, 이 구조를 모든 사이트의 기본값으로 삼지 않는다.

### robots와 접근 범위

- 직접 HTML은 실제 호스트·경로·User-Agent와 리다이렉트 목적지의 robots 정책을 확인한다. 현재 HTML preview/collect는 서버가 검사하고, TinyFish 경로는 제공자에게 수집을 요청한다. 직접 요청의 판정과 제공자의 처리 정책을 구분한다.
- robots 거부, 로그인 필요·비공개, 네트워크 실패, 렌더링 부족을 구분한다. 지원하지 않는 콘텐츠는 수집 불가로 명시한다. 공식 API는 해당 접근·인증 정책을 따른다.
- 키는 기존 환경 설정으로 읽고 `.env`, 인증 헤더, 서명 URL 토큰은 로그·fixture·PR에서 제외한다.

## 2. TinyFish 응답으로 규칙 찾기

작업 시 [Fetch API 공식 문서](https://docs.tinyfish.ai/fetch-api/reference)를 다시 확인한다. Agent API와 혼동하지 말고 기존 `TinyFishFetchClient`를 재사용한다.

- 현재 서버는 `markdown`, `image_links: true`를 사용한다. 조사에 `html`·`json`·`links`가 필요하면 응답 구조와 기존 파서의 호환성을 확인한다.
- HTTP 200만 보지 말고 `results[]`와 `errors[]`를 확인한다. `final_url`, `title`, `description`, `text`, `image_links`를 원본 화면과 대조한다.
- `include_selectors`는 text·links·image_links 범위를 제한하지만 title·description은 전체 문서 기준이다. `exclude_selectors`가 먼저 적용된다. include가 전혀 매칭되지 않으면 `selector_not_matched`이며 전체 페이지로 자동 폴백하지 않는다.

사이트에 존재하는 유형 중 단일/여러 이미지, 영상, 텍스트만 있는 글, 답글·인용, 프로필, 공유·모바일 링크를 골라 비교한다. 요청 URL·필요 필드·실제 반환값·이미지 출처를 간단히 기록하고, 일회성 표본에서 찾은 특징과 공식 보장 규칙을 구분한다.

## 3. 필요한 조건만 적용

- **대상 식별:** 다른 게시물·댓글·광고를 제외할 근거는 유지한다. 같은 ID의 쿼리·끝 슬래시·공개 경로 변형은 허용한다. 근거 없는 ID 자릿수·파일명 일치 조건을 추가하지 않는다.
- **본문:** 작성자·UI·반응 수를 제거하되 본문 속 일정과 게시 시각을 혼동하지 않는다. 반복 블록과 주변 구조를 확인한다. 파싱이 불확실하면 신뢰할 수 있는 메타 설명을 사용하고, 텍스트 실패만으로 유효한 이미지를 버리지 않는다. 대체 시 전문이 짧아질 수 있음을 알린다.
- **이미지:** 원본 이미지와 선택 결과를 직접 열어 비교한다. HTTP 200이나 URL 존재만으로 적합하다고 판단하지 않는다. CDN·경로·링크 관계로 후보의 소유 콘텐츠를 확인하고, 아바타·UI 아이콘·다른 글 이미지를 제외한다.
- **순번:** `image_links` 배열 위치를 사진 번호로 해석하지 않는다. `/photo/N` 같은 실제 미디어 링크로 대응한다. 빈 링크만 있는데 다른 정상 이미지를 지우지 않는다. 지정 미디어가 없으면 같은 콘텐츠의 확보된 미디어로 대체할 수 있지만 순번 일치는 주장하지 않는다.
- **없음과 실패:** 자체 이미지가 없으면 `null`이다. 인용 원글·계정 이미지로 억지로 채우지 않는다. 프로필 링크나 장소 페이지는 그 콘텐츠 자체의 대표 이미지를 선택한다. 로딩으로 데이터가 전부 누락된 경우와 정상 무이미지 글은 구분하고, 일시 오류만 기존 제한 내에서 재시도한다.
- **URL 안정성:** 유효한 쿼리·이미지 포맷을 임의로 제거하지 않는다. 서명 만료 이미지는 URL만 저장할 때 깨질 수 있다. 토큰 제거·재호스팅을 검증 없이 대책으로 삼지 않는다.

## 4. 코드에 전략 추가

아래 경로는 모두 `src/modules/link/content/` 기준이다.

1. **수집 방식 결정:** 일반 OG로 충분하면 기본 HTML 전략을 유지한다. oEmbed는 `LinkContentOEmbedStrategy`의 endpoint·응답 파서를 구현하고, TinyFish는 아래처럼 `LinkContentTinyFishStrategy`를 구현한다. 새 공식 API가 필요하면 전용 client와 전략 타입·서비스 실행 경로·Nest provider 등록을 함께 검토한다. 다른 사이트에 `kind: 'youtube'`를 재사용하지 않는다.
2. **파일 작성:** `strategy/site/{site}-link-content.strategy.ts`를 만든다. 복잡한 URL·본문·이미지 규칙은 같은 폴더의 파서로 분리한다. 다음은 TinyFish 연결 예시이며 `example`과 도메인은 대상 사이트로 바꾸고, import한 함수는 조사한 규칙으로 구현한다.

```ts
// strategy/site/example-link-content.strategy.ts
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import {
    prepareExampleUrl,
    normalizeExampleContent,
    selectExampleImage,
} from './example-content.parser'

export const EXAMPLE_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'example',
    supports: (url) =>
        ['example.com', 'www.example.com'].includes(url.hostname) &&
        url.pathname.startsWith('/posts/'),
    prepareUrl: prepareExampleUrl,
    normalizeContent: normalizeExampleContent,
    selectImage: selectExampleImage,
}
```

`supports`는 검증한 콘텐츠 경로만 허용한다. `prepareUrl`은 원본 URL을 수정하지 않고 확인한 embed·모바일 URL 등을 반환한다. `normalizeContent`는 `TinyFishResponseContent`를 반환하고 `selectImage`는 이미지 URL 또는 `null`을 반환한다. 범위 제한이 필요할 때만 `fetchOptions`를 추가하며, `article` 같은 선택자도 실제 DOM을 확인한 뒤 사용한다. 기존 TinyFish client를 쓰는 전략은 별도 Nest provider 등록이 필요 없다.

3. **Registry 등록:** `strategy/link-content-strategy.registry.ts`에서 상수를 import하고 기존 `LINK_CONTENT_STRATEGIES` 배열에 추가한다. 먼저 매칭된 전략이 선택되므로 경로가 겹치면 구체적인 전략을 앞에 둔다. 매칭되지 않은 URL의 기본 HTML 동작은 유지한다.

```ts
import { EXAMPLE_LINK_CONTENT_STRATEGY } from './site/example-link-content.strategy'

const LINK_CONTENT_STRATEGIES: readonly LinkContentStrategy[] = [
    // 기존 전략 항목은 그대로 유지한다.
    EXAMPLE_LINK_CONTENT_STRATEGY,
]
```

4. **테스트·문서 연결:** 사이트 옆 `*.spec.ts`에 URL 정규화·본문·이미지 규칙을 테스트하고, `link-content-strategy.registry.spec.ts`에서 대상 URL의 선택과 유사 도메인·비대상 경로 제외를 확인한다. `link-content.service.spec.ts`에서는 preview/collect 결과와 요청 수, TinyFish 키가 없을 때 기존 HTML 경로를 검증한다. 콘텐츠 README에 지원 경로·선택 기준·미지원 케이스를 짧게 추가한다.

```sh
bun run test -- --runInBand --testPathPattern=modules/link/content
bun run build
bun run lint
```

## 5. 속도와 품질을 함께 검증

요청 URL·응답 형식·캐시에 따라 시간과 수집 품질이 달라질 수 있다. [Fetch 개요](https://docs.tinyfish.ai/fetch-api)를 확인하되, 경로 선택은 실측과 필요한 필드의 확보 여부로 판단한다.

- 같은 콘텐츠로 URL·format·scope를 하나씩 바꿔 비교한다. scope는 추출 범위 설정이며 렌더링 생략이나 속도 향상을 보장하지 않는다.
- 정상 수집은 가능한 한 1회로 끝낸다. 필요한 추가 요청은 이미지/본문 회복 효과와 지연·비용을 함께 기록한다. preview와 collect가 필요한 필드가 다르면 목적별 경로를 분리할 수 있다.
- `ttl: 0`은 live fetch, 양수는 해당 시간 내 캐시 허용이다. 캐시 허용 측정과 live 측정을 구분하고 여러 번 재어 범위·중앙값·성공률·요청 수를 기록한다. 캐시 적중을 확인하지 못했다면 warm/cold라고 단정하지 않는다.
- 캐시·대상·환경이 다른 단일 측정으로 속도 개선율을 주장하지 않는다.

## 완료 기준

- 구현한 `preview`·`collect`로 실제 링크를 재검증하고 원본 제목·이미지와 비교한다. 이미지 없음도 정상 결과로 확인한다.
- 회귀 테스트는 누락·순서 변경·경계 오인처럼 실제 실패 조건과 다른 글 혼입 방지에 집중한다. 관련 테스트·빌드·린트를 수행하고 공통 코드를 바꾸면 영향받는 사이트도 검증한다.
- 결과는 **선택 경로, 핵심 규칙, 확인한 케이스, 요청 수/실측 조건, 남은 한계**만 짧게 정리한다. 미검증을 성공으로 표시하지 않는다.
