# PR #111: [feat] X·Instagram 링크를 TinyFish로 수집

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/111
- Author: @vcz-Chan
- Base: main
- Head: feature/tinyfish-social-content
- Merged: 2026-09-06T03:57:07Z

## PR Body

## 한 줄 요약

X와 Instagram 링크를 TinyFish로 수집하고, 링크마다 가장 적합한 수집 방식을 선택할 수 있도록 링크 콘텐츠 수집 구조를 정리했습니다.

이 PR은 **#110 위에 쌓인 후속 PR**입니다.

- #110: Brunch HTML 요청 대응, YouTube oEmbed, 사이트별 전략 구조 추가
- #111: X·Instagram TinyFish 지원, 수집 실행 흐름과 책임 분리

## 왜 필요한가요?

사용자가 저장하는 링크는 미리 알 수 없습니다. 사이트마다 응답 방식도 다릅니다.

- 일반 사이트는 HTML에서 OG와 본문을 읽을 수 있습니다.
- YouTube는 서버에서 `watch` 페이지를 요청하면 정상 OG 대신 봇 확인 HTML을 반환할 수 있습니다.
- X와 Instagram은 데이터센터 IP에서 HTML/OG 접근이 제한되거나 브라우저 실행이 필요합니다.

따라서 하나의 HTML 요청 방식으로 모든 링크를 처리하지 않고, URL에 맞는 수집 방식을 선택하는 **랜덤 링크 디펜스** 구조를 사용합니다.

별도 크롤링 인프라나 사람 검수는 더 넓은 범위를 처리할 수 있지만 느리고 운영 비용이 큽니다. 우선 요청 안에서 바로 실행 가능한 자동 수집 방식을 늘리고, 해당 방식들은 추후 비동기 보완 단계로 검토합니다.

## 어떻게 동작하나요?

```text
사용자 URL
   │
   ▼
사이트 전략 선택
   │
   ├─ html ────── HTML fetch ── OG·본문 파싱
   │
   ├─ oembed ──── 구조화된 oEmbed 응답
   │                 └─ 실패하면 HTML fetch
   │
   └─ tinyfish ─── TinyFish Fetch API
                     └─ API key가 없을 때만 HTML fetch
```

`preview`와 `collect`가 같은 전략 선택 흐름을 공유합니다.

- `preview`: 제목, 썸네일, 출처 반환
- `collect`: 제목, 설명, 본문, 대표 이미지를 수집해 저장 및 AI 분석에 사용

## 현재 도메인별 전략

| 링크 | 우선 수집 방식 | 선택 이유 | 대체 수집 |
| --- | --- | --- | --- |
| 일반 공개 HTTP(S) URL | HTML | OG와 본문을 직접 파싱할 수 있음 | 없음 |
| Brunch | HTML + `Promise9Bot/1.0` | 일반 브라우저 UA보다 전용 bot UA에서 정상 응답 | 없음 |
| YouTube | oEmbed | `watch` 페이지의 봇 확인 HTML을 피하고 구조화된 제목·썸네일 사용 | oEmbed 실패 시 HTML |
| X | TinyFish | 서버 IP의 HTML/OG 수집이 불안정 | API key가 없을 때 HTML |
| Instagram | TinyFish | 서버 IP의 HTML/OG 수집이 불안정하고 콘텐츠 렌더링이 필요 | API key가 없을 때 HTML |

지원 URL 범위는 다음과 같습니다.

- YouTube: `youtube.com` 및 하위 도메인, `youtu.be`
- X: `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`의 프로필·게시물 URL
- Instagram: `instagram.com`, `www.instagram.com`의 프로필·`p`·`reel`·`reels`·`tv` URL
- 로그인, 설정, 검색 등 콘텐츠가 아닌 예약 경로는 X·Instagram TinyFish 대상에서 제외
- `x.com.evil.example` 같은 유사 hostname은 전용 전략에 포함하지 않음

## 수집 전략과 HTML 요청 정책의 차이

두 정책은 별도로 관리합니다.

1. **수집 전략**은 `html | oembed | tinyfish` 중 무엇을 실행할지 결정합니다.
2. **HTML 요청 정책**은 HTML을 직접 요청하게 됐을 때 사용할 User-Agent를 결정합니다.

예를 들어 Brunch는 새로운 수집 방식이 필요한 사이트가 아닙니다. 수집 방식은 HTML이지만 User-Agent만 다르므로 HTML 요청 정책에만 등록합니다. 반대로 X·Instagram의 TinyFish 요청에는 HTML User-Agent가 필요하지 않습니다.

HTML redirect가 발생하면 이동한 URL도 다시 공개 URL인지 검사하고 robots.txt와 User-Agent 정책을 다시 적용합니다. 현재는 HTML 수집을 시작한 뒤 redirect된 URL에 맞춰 oEmbed나 TinyFish로 방식을 바꾸지는 않습니다. 단축 URL을 통한 방식 전환이 실제로 필요해지면 별도 작업으로 검토합니다.

## 현재 폴더 구조

```text
src/modules/link/content/
├── link-content.service.ts
│   └── 수집 방식 선택·실행, preview/collect 결과 변환, 이미지 URL 검증
├── link-content.parser.ts
│   └── HTML의 OG·본문 파싱
├── link-content-response.reader.ts
│   └── HTML·oEmbed 응답 크기 제한과 charset 디코딩
├── link-content.constants.ts
├── link-content.type.ts
├── robots.parser.ts
│
├── html/
│   ├── link-content-html.fetcher.ts
│   │   └── HTML 요청, redirect, robots.txt, SSRF 검증
│   └── link-content-html-request.policy.ts
│       └── Brunch 등 HTML 도메인별 User-Agent 선택
│
├── strategy/
│   ├── link-content-strategy.type.ts
│   │   └── 세 수집 방식에 필요한 사이트 설정 타입
│   ├── link-content-strategy.registry.ts
│   │   └── URL을 지원하는 사이트 규칙 탐색
│   ├── link-content-url.util.ts
│   └── site/
│       ├── default-link-content.strategy.ts
│       ├── youtube-link-content.strategy.ts
│       ├── x-link-content.strategy.ts
│       └── instagram-link-content.strategy.ts
│
└── tinyfish/
    ├── tinyfish-fetch.client.ts
    │   └── API 요청, timeout, 응답 크기 제한
    ├── tinyfish-response.parser.ts
    │   └── 응답 검증, 텍스트 정규화, 오류 분류
    ├── tinyfish-image.selector.ts
    │   └── 안전하게 이미지 후보 순회
    └── tinyfish-fetch.error.ts
        └── 재시도 가능 여부를 포함한 내부 오류
```

테스트 파일은 각 구현 파일과 같은 위치에 둡니다.

## 이 PR에서 변경한 내용

- [x] X·Instagram의 지원 도메인·경로와 대표 이미지 규칙을 사이트별 파일로 분리
- [x] X·Instagram 미리보기와 저장 후 분석 모두 TinyFish 사용
- [x] 사이트별 TinyFish 요청 URL 정규화와 대표 이미지 선택 정책 분리
- [x] TinyFish client가 검증하고 정리된 공통 결과만 반환하도록 변경
- [x] HTML 네트워크 처리와 응답 읽기를 `LinkContentService`에서 분리
- [x] 수집 전략과 HTML User-Agent 정책 분리
- [x] `TINY_FISH_API_KEY` 존재 여부로 TinyFish 활성화
- [x] 배포 workflow에서 `TINY_FISH_API_KEY` 검증 및 주입

## TinyFish 실패 정책

API key가 없는 환경에서는 기존 HTML 흐름을 유지합니다.

API key가 있는 환경에서 TinyFish가 실패하면 불완전한 HTML/OG 결과를 성공처럼 합치지 않습니다.

- timeout, rate limit, 대상 사이트 또는 TinyFish의 일시적인 서버 오류: 재시도 가능
- 로그인 요구, 봇 차단, 페이지 없음: 수집 불가
- 분석할 본문이 없음: SUMMARY·TAGS를 실행하지 않고 수집 불가 이유를 남김

## 대표 이미지 정책

TinyFish의 `image_links`는 대표 이미지 순서를 보장하지 않습니다. 배열의 첫 이미지를 그대로 사용하지 않고 실제 응답에서 검증한 사이트별 규칙을 적용합니다.

- X: `pbs.twimg.com`의 본문 미디어만 선택하고 avatar 제외
- Instagram: 허용된 Instagram·Meta CDN과 게시물 식별 신호를 만족하는 이미지 선택
- Reel: 대표 이미지임을 확실하게 판별할 수 없는 후보는 사용하지 않음
- 최종 후보: 공개 HTTP(S) URL 검증과 길이 제한 적용

Instagram CDN의 서명된 이미지 URL은 만료될 수 있으며, TinyFish 응답 형식이 바뀌면 이미지 선택 규칙을 다시 검증해야 합니다.

## 새로운 사이트를 추가하는 방법

1. 실제 실패 링크와 필요한 결과를 확인합니다.
2. HTML 요청으로 충분하고 User-Agent만 다르면 HTML 요청 정책에 도메인을 추가합니다.
3. 기존 HTML, oEmbed, TinyFish 중 하나로 처리할 수 있으면 해당 사이트의 URL 규칙을 등록합니다.
4. 세 방식으로 처리할 수 없을 때만 공식 API 등 새로운 수집 방식을 추가하고 `LinkContentService.resolveContent`에 연결합니다.
5. 자동 수집만으로 부족한 사례가 충분히 쌓이면 별도 수집 인프라와 사람 검수를 비동기 보완 단계로 검토합니다.

현재는 세 수집 방식의 선택과 실행 흐름을 `LinkContentService.resolveContent` 한 곳에서 관리합니다.

## 실제 링크 검증 결과

현재 PR 브랜치에서 대표 URL의 `preview`와 `collect`를 실제 호출한 결과입니다. 외부 사이트와 TinyFish 응답 변경에 따라 결과는 달라질 수 있습니다.

| 유형 | 선택된 전략 | 제목 | 설명·본문 | 대표 이미지 | 결과 |
| --- | --- | --- | --- | --- | --- |
| X 게시물 | TinyFish | O | O | O | 정상 |
| Instagram 게시물 | TinyFish | O | O | O | 정상 |
| Instagram Reel | TinyFish | O | O | X | 부분 정상 |
| Instagram 프로필 | TinyFish | O | O | O | 정상 |
| YouTube 영상 | oEmbed | O | X | O | 의도된 제한 |
| YouTube Shorts | oEmbed | O | X | O | 의도된 제한 |
| YouTube 채널 | oEmbed → HTML 대체 수집 | O | O | O | 정상 |
| Brunch 글 | HTML | O | O | O | 정상 |

- Instagram Reel은 TinyFish 요청에는 성공했습니다. 다만 추천 콘텐츠 이미지를 대표 이미지로 잘못 선택하지 않도록 현재 전략이 이미지를 명시적으로 `null` 처리합니다.
- YouTube 영상과 Shorts는 oEmbed 응답 범위에 따라 제목과 썸네일만 수집합니다.
- YouTube 채널은 oEmbed가 지원하지 않아 HTML/OG로 다시 수집한 결과입니다.
- Brunch는 전용 User-Agent를 사용해 미리보기와 본문을 수집했습니다.
- 운영 백업의 활성 링크 220개를 분류한 결과, 전략 분류 누락과 URL 파싱 실패는 없었습니다. 이 검증은 220개 링크 전체의 원격 콘텐츠 수집 성공을 의미하지는 않습니다.

## 검증

- 전체 테스트 293개 통과
- ESLint 오류 0개
- TypeScript 빌드 통과
- 실제 YouTube·Brunch·X·Instagram URL의 preview/collect 확인
- 지원 URL 경계, 위장 hostname, 이미지 오탐, redirect별 User-Agent, TinyFish 오류·응답 제한 테스트

> 배포 환경에는 repository secret `TINY_FISH_API_KEY`가 필요합니다. workflow는 secret이 비어 있으면 배포를 실패 처리합니다.

## 관련 PR

- #110
