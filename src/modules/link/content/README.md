# 링크 콘텐츠 수집

## 목표: 랜덤 링크 디펜스

사용자가 입력하는 링크는 사이트, 페이지 유형, 접근 제한이 제각각이다. 하나의 범용
요청 방식만으로는 모든 링크에서 안정적으로 제목, 본문, 대표 이미지를 가져오기 어렵다.

링크 콘텐츠 모듈은 URL을 보고 현재 가장 적합한 수집 방식을 선택한다. 새로운 실패
유형이 발견되면 사이트별 규칙이나 수집 방식을 추가해 지원 범위를 점진적으로 넓힌다.
이 접근을 **랜덤 링크 디펜스**라고 부른다.

별도 크롤링 인프라나 사람 검수는 처리 시간이 길고 운영 비용이 크므로 현재 요청
과정에는 포함하지 않는다. 자동 수집만으로 처리하기 어려운 링크가 충분히 쌓이면 추후
비동기 보완 단계로 검토한다.

## 수집 흐름

```text
사용자 URL
   │
   ▼
URL에 맞는 수집 방식 선택
   │
   ├─ html ────── HTML 요청 ── OG·본문 파싱
   │
   ├─ oembed ──── 구조화된 oEmbed 응답
   │                 └─ 실패하면 HTML로 다시 시도
   │
   └─ tinyfish ─── TinyFish Fetch API
                     └─ API key가 없을 때만 HTML 사용
```

현재 지원하는 수집 방식은 세 가지다.

| 코드의 `kind` | 동작 | 적용 사례 |
| --- | --- | --- |
| `html` | 페이지 HTML에서 OG와 본문을 파싱한다. | 일반 링크, Brunch |
| `oembed` | 사이트가 제공하는 구조화된 응답을 사용한다. | YouTube |
| `tinyfish` | 일반 HTML 접근이 제한된 공개 페이지를 TinyFish로 수집한다. | X, Instagram |

`preview`와 `collect`는 같은 방식 선택 흐름을 공유한다.

- `preview`: 저장 전에 제목, 썸네일, 출처를 반환한다. 응답 속도를 위해 robots.txt는
  조회하지 않는다.
- `collect`: 저장 후 제목, 설명, 본문, 대표 이미지를 수집한다. AI 입력으로 사용할 수
  있으므로 HTML 요청 전에 robots.txt 허용 여부를 확인한다.

## 도메인별 현재 동작

| 링크 | 우선 방식 | 이유 | 대체 동작 |
| --- | --- | --- | --- |
| 그 밖의 공개 HTTP(S) URL | HTML | OG와 본문을 직접 읽을 수 있다. | 없음 |
| `brunch.co.kr` 및 하위 도메인 | HTML | 전용 `Promise9Bot/1.0` User-Agent에서 정상 응답한다. | 없음 |
| `youtube.com` 및 하위 도메인, `youtu.be` | oEmbed | 영상 페이지의 봇 확인 HTML 대신 제목·썸네일 구조화 응답을 사용한다. | oEmbed 실패 시 HTML |
| `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com` | TinyFish | 서버 IP의 HTML/OG 수집이 불안정하다. | API key가 없을 때 HTML |
| `instagram.com`, `www.instagram.com` | TinyFish | 서버 IP의 HTML/OG 수집이 불안정하고 콘텐츠 렌더링이 필요하다. | API key가 없을 때 HTML |

X는 프로필, `/{user}/status/{id}`, `/i/web/status/{id}`를 지원한다. Instagram은 프로필,
`/p/{id}`, `/reel/{id}`, `/reels/{id}`, `/tv/{id}`를 지원한다. 로그인·설정·검색처럼
콘텐츠가 아닌 경로는 TinyFish 대상에서 제외한다. `x.com.evil.example` 같은 유사
hostname도 전용 방식으로 처리하지 않는다.

## 수집 방식과 HTML 요청 설정

다음 두 결정은 서로 다르다.

1. 수집 방식 선택: URL을 HTML, oEmbed, TinyFish 중 무엇으로 수집할지 결정한다.
2. HTML 요청 설정 선택: HTML을 요청할 때 어떤 User-Agent를 사용할지 결정한다.

Brunch는 새로운 수집 방식이 필요한 사이트가 아니다. 수집 방식은 HTML이지만 전용
User-Agent가 필요하므로 HTML 요청 설정에만 예외를 둔다. TinyFish로 수집하는 X와
Instagram에는 HTML User-Agent 설정이 적용되지 않는다.

HTML 리다이렉트가 발생하면 이동한 URL도 다시 공개 URL인지 검사하고, `collect`에서는
robots.txt도 다시 확인한다. User-Agent 역시 이동한 도메인에 맞게 다시 선택한다.

현재 HTML 수집을 시작한 뒤 리다이렉트된 URL에 맞춰 oEmbed나 TinyFish로 방식을 바꾸지는
않는다. 단축 URL을 통한 방식 전환이 실제로 필요해지면 전환 횟수 제한과 순환 방지를
포함해 별도로 설계한다.

## 파일별 역할

| 경로 | 역할 |
| --- | --- |
| `link-content.service.ts` | URL에 맞는 방식을 선택하고 실행하며 `preview`·`collect` 결과를 만든다. |
| `link-content.parser.ts` | HTML에서 OG와 본문을 파싱한다. |
| `link-content-response.reader.ts` | HTML·oEmbed 응답의 크기를 제한하고 charset에 맞춰 디코딩한다. |
| `html/link-content-html.fetcher.ts` | HTML 요청, 리다이렉트, robots.txt, SSRF 검증을 담당한다. |
| `html/link-content-html-request.policy.ts` | HTML 요청에 사용할 도메인별 User-Agent를 선택한다. |
| `strategy/link-content-strategy.registry.ts` | URL을 지원하는 사이트 규칙을 찾고, 없으면 기본 HTML 방식을 반환한다. |
| `strategy/site/` | YouTube·X·Instagram의 지원 URL과 사이트별 처리 규칙을 정의한다. |
| `tinyfish/tinyfish-fetch.client.ts` | TinyFish API 요청, timeout, 응답 크기 제한을 담당한다. |
| `tinyfish/tinyfish-response.parser.ts` | TinyFish 응답을 검증하고 공통 결과 또는 수집 불가 상태로 변환한다. |
| `tinyfish/tinyfish-image.selector.ts` | 잘못된 URL을 건너뛰며 사이트 조건에 맞는 이미지 후보를 찾는다. |

`LinkContentService.resolveContent` 한 곳에서 세 수집 방식의 실행 흐름을 확인할 수 있다.

## 사이트 지원 추가

먼저 실제 실패 URL과 필요한 결과를 확인한 뒤 아래 중 하나를 선택한다.

### HTML 요청 설정만 다른 경우

기본 HTML 수집으로 충분하고 User-Agent만 다르면
`html/link-content-html-request.policy.ts`에 도메인 조건을 추가한다. 정확한 hostname과
유사 위장 도메인을 함께 테스트한다.

### 기존 수집 방식으로 처리 가능한 경우

1. `strategy/site/`에 사이트 규칙 파일을 만든다.
2. `supports`에 정확한 hostname과 지원 경로를 선언한다.
3. `html`, `oembed`, `tinyfish` 중 사용할 방식을 지정한다.
4. `link-content-strategy.registry.ts`에 등록한다.
5. 정상 URL, 제외 경로, 유사 위장 도메인을 테스트한다.

사이트 규칙에는 해당 사이트에서만 달라지는 내용만 둔다. timeout, 리다이렉트, 응답
크기, SSRF 방어는 공통 요청 코드에서 처리한다.

### 새로운 수집 방식이 필요한 경우

기존 세 방식으로 처리할 수 없다는 것을 실제 응답으로 확인한 후 추가한다.

1. 인증 방식, 요청 대상, 응답 구조, `preview`·`collect` 제공 범위와 실패 동작을 정한다.
2. `link-content-strategy.type.ts`에 새로운 `kind`와 필요한 설정을 추가한다.
3. 외부 API를 사용하면 요청 코드, 응답 변환 코드, 내부 오류 타입을 별도 디렉터리에 둔다.
4. `LinkContentService.resolveContent`에 실행 흐름을 연결한다.
5. 필요한 환경변수, Nest provider, 배포 workflow를 함께 갱신한다.
6. URL 경계, 오류·재시도, 응답 크기, 민감 정보 제거를 테스트한다.

예를 들어 네이버 지도에 별도 공식 API가 필요하다면 실제 API와 인증 정책을 확인한 뒤
새로운 수집 방식으로 추가할 수 있다. HTML이나 기존 oEmbed로 충분하면 새로운 방식을
만들지 않는다.

## TinyFish 세부 정책

TinyFish client는 특정 사이트의 URL 범위나 대표 이미지 규칙을 알지 않는다. 응답을
검증하고 공통 형태로 변환하는 일까지만 담당한다. TinyFish에 전달할 URL 정리와 대표
이미지 선택은 X·Instagram 사이트 규칙에서 담당한다.

API key가 없으면 HTML로 다시 시도한다. API key가 있는데 TinyFish 요청이 실패하면
불완전한 HTML/OG 결과와 합쳐 성공처럼 반환하지 않는다.

TinyFish의 `image_links`는 대표 이미지 순서를 보장하지 않는다. 지원 사이트를 추가할
때는 실제 URL 여러 건의 응답 이미지를 확인하고, 사이트 규칙의 `selectImage`에 검증할 수
있는 조건을 작성한다. 배열의 첫 이미지를 그대로 사용하지 않는다.
