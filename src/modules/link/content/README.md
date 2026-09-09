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
   ├─ youtube ─── 미리보기: oEmbed → HTML
   │              저장 수집: Data API → oEmbed → HTML
   │
   ├─ oembed ──── 구조화된 oEmbed 응답
   │                 └─ 실패하면 HTML로 다시 시도
   │
   └─ tinyfish ─── TinyFish Fetch API
                     └─ API key가 없을 때만 HTML 사용
```

현재 지원하는 수집 방식은 네 가지다.

| 코드의 `kind` | 동작                                                                     | 적용 사례                            |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `html`        | 페이지 HTML에서 OG와 본문을 파싱한다.                                    | 일반 링크, Brunch                    |
| `youtube`     | 미리보기는 oEmbed, 저장 수집은 Data API로 시작하며 기존 경로로 폴백한다. | YouTube                              |
| `oembed`      | 사이트가 제공하는 구조화된 응답을 사용한다.                              | oEmbed를 우선하는 사이트용 공통 경로 |
| `tinyfish`    | 일반 HTML 접근이 제한되거나 응답이 큰 공개 페이지를 TinyFish로 수집한다. | X, Instagram, Behance                |

`preview`와 `collect`는 사이트별 방식 선택을 공유하고, 기존 `purpose` 값으로 목적을 구분한다.

- `preview`: 저장 전에 제목, 썸네일, 출처를 반환한다. HTML 요청 전에 robots.txt 허용 여부를 확인한다.
- `collect`: 저장 후 제목, 설명, 본문, 대표 이미지를 수집한다. AI 입력으로 사용할 수
  있으므로 HTML 요청 전에 robots.txt 허용 여부를 확인한다.

YouTube 미리보기는 기존 oEmbed → HTML 경로를 사용하고 Data API를 호출하지 않는다.
제목·썸네일만 필요한 미리보기에서는 Data API 할당량을 소비하지 않는다.
저장 후 수집은 공식 Data API로 제목·썸네일·설명란을 먼저 조회한다.
이 변경의 목적은 응답 속도 개선보다 AI 분석과 검색에 사용할 영상 설명을 확보하는 것이다.
일반 영상, `youtu.be` 공유 링크, Shorts, embed, live 경로에서 영상 ID를 추출한다.
API 결과가 있으면 oEmbed와 HTML은 요청하지 않는다. 썸네일은 제공된 해상도 중
`maxres → standard → high → medium → default` 순으로 선택하고 공개 URL인지 검증한다.
설명은 `description`에 넣고 기존 정책대로 최대 2,000자를 저장·분석에 사용한다.
영상 본문·자막은 수집하지 않으며 HTML 폴백에서도 `content`는 `null`이다.

### YouTube API 설정과 폴백

1. Google Cloud 프로젝트에서 **YouTube Data API v3**를 활성화하고 API 키를 발급한다.
2. 로컬 `.env`에 `YOUTUBE_API_KEY`를 설정한다. 로그인용 `GOOGLE_CLIENT_ID`와는 별도다.
3. 배포 시 GitHub Actions secret `YOUTUBE_API_KEY`를 설정한다. 배포 workflow가 서버 환경변수에 전달한다.

저장 후 수집에서 키가 없거나 영상이 조회되지 않거나 API 요청이 실패하면 oEmbed로 제목·썸네일을 수집한다.
인증 오류·할당량 초과·타임아웃·잘못된 응답도 같은 폴백 경로를 사용한다.
oEmbed도 실패하면 기존 HTML 수집으로 넘어간다. 저장 후 수집은 robots.txt 검사를 수행한다. 미리보기 robots.txt 적용은 별도 PR #121에서 다룬다.
HTML까지 요청 오류로 실패하면 최종 오류를 호출부에 전달한다. 저장 후 분석은 기존 재시도 정책을 적용한다.
폴백이 성공하면 Data API 실패 때문에 별도 재시도하지 않고 확보한 정보로 저장·분석을 계속한다.
영상 정보가 정상 조회됐지만 설명이나 이미지가 없는 경우에는 해당 필드를 `null`로 유지하고 추가 요청하지 않는다.
키와 원격 오류 응답은 애플리케이션 로그에 출력하지 않는다.

공식 요청: `GET /youtube/v3/videos?part=snippet&id={videoId}&fields=items(id,snippet(title,description,thumbnails))`.
정상 경로에서 미리보기는 oEmbed 1회, 저장 수집은 Data API 1회를 호출한다.
따라서 미리보기 후 저장 시 외부 HTTP 요청은 총 2회, Data API 호출은 1회다.
미리보기와 저장 사이의 캐시 재사용은 없으며, 저장 후 썸네일은 더 높은 해상도의 후보로 달라질 수 있다.
[영상 메타데이터 문서](https://developers.google.com/youtube/v3/docs/videos#snippet.description)를 참고한다.

## 도메인별 현재 동작

| 링크                                                                  | 우선 방식                         | 이유                                                                                | 대체 동작                            |
| --------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| 그 밖의 공개 HTTP(S) URL                                              | HTML                              | OG와 본문을 직접 읽을 수 있다.                                                      | 없음                                 |
| `brunch.co.kr` 및 하위 도메인                                         | HTML                              | 전용 `Promise9Bot/1.0` User-Agent에서 정상 응답한다.                                | 없음                                 |
| `youtube.com` 및 하위 도메인, `youtu.be`                              | 미리보기: oEmbed / 저장: Data API | 미리보기는 제목·썸네일, 저장은 설명까지 수집한다.                                   | 미리보기: HTML / 저장: oEmbed → HTML |
| `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`                | TinyFish                          | 서버 IP의 HTML/OG 수집이 불안정하다.                                                | API key가 없을 때 HTML               |
| `instagram.com`, `www.instagram.com`                                  | TinyFish                          | 서버 IP의 HTML/OG 수집이 불안정하고 콘텐츠 렌더링이 필요하다.                       | API key가 없을 때 HTML               |
| `behance.net`, `www.behance.net`, `be.net`의 `/gallery/{id}` 프로젝트 | TinyFish                          | 원본 HTML이 크고 일반 요청 제한 안에 프로젝트 본문·이미지를 안정적으로 읽기 어렵다. | API key가 없을 때 HTML               |

X는 프로필, `/{user}/status/{id}`, `/i/web/status/{id}`를 지원한다. Instagram은 프로필,
`/p/{id}`, `/reel/{id}`, `/reels/{id}`, `/tv/{id}`를 지원한다. 로그인·설정·검색처럼
콘텐츠가 아닌 경로는 TinyFish 대상에서 제외한다. `x.com.evil.example` 같은 유사
hostname도 전용 방식으로 처리하지 않는다.

Behance는 공개 프로젝트 `/gallery/{id}/{slug}`와 Behance가 제공하는 `be.net/gallery/...`
공유 링크만 지원한다. 프로필·검색·갤러리 목록은 일반 HTML 처리를 유지한다.

## 수집 방식과 HTML 요청 설정

다음 두 결정은 서로 다르다.

1. 수집 방식 선택: URL을 HTML, YouTube Data API, oEmbed, TinyFish 중 무엇으로 수집할지 결정한다.
2. HTML 요청 설정 선택: HTML을 요청할 때 어떤 User-Agent를 사용할지 결정한다.

Brunch는 새로운 수집 방식이 필요한 사이트가 아니다. 수집 방식은 HTML이지만 전용
User-Agent가 필요하므로 HTML 요청 설정에만 예외를 둔다. TinyFish로 수집하는 X와
Instagram에는 HTML User-Agent 설정이 적용되지 않는다.

HTML 리다이렉트가 발생하면 이동한 URL도 다시 공개 URL인지 검사하고, 미리보기와 저장 후 수집 모두
robots.txt도 다시 확인한다. User-Agent 역시 이동한 도메인에 맞게 다시 선택한다.

현재 HTML 수집을 시작한 뒤 리다이렉트된 URL에 맞춰 oEmbed나 TinyFish로 방식을 바꾸지는
않는다. 단축 URL을 통한 방식 전환이 실제로 필요해지면 전환 횟수 제한과 순환 방지를
포함해 별도로 설계한다.

## 파일별 역할

| 경로                                         | 역할                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `link-content.service.ts`                    | URL에 맞는 방식을 선택하고 실행하며 `preview`·`collect` 결과를 만든다. |
| `youtube/youtube-data.client.ts`             | 공식 YouTube Data API 요청과 응답 검증을 담당한다.                     |
| `link-content.parser.ts`                     | HTML에서 OG와 본문을 파싱한다.                                         |
| `link-content-response.reader.ts`            | HTML·oEmbed 응답의 크기를 제한하고 charset에 맞춰 디코딩한다.          |
| `html/link-content-html.fetcher.ts`          | HTML 요청, 리다이렉트, robots.txt, SSRF 검증을 담당한다.               |
| `html/link-content-html-request.policy.ts`   | HTML 요청에 사용할 도메인별 User-Agent를 선택한다.                     |
| `strategy/link-content-strategy.registry.ts` | URL을 지원하는 사이트 규칙을 찾고, 없으면 기본 HTML 방식을 반환한다.   |
| `strategy/site/`                             | 사이트별 지원 URL과 처리 규칙을 정의한다.                              |
| `tinyfish/tinyfish-fetch.client.ts`          | TinyFish API 요청, timeout, 응답 크기 제한을 담당한다.                 |
| `tinyfish/tinyfish-response.parser.ts`       | TinyFish 응답을 검증하고 공통 결과 또는 수집 불가 상태로 변환한다.     |
| `tinyfish/tinyfish-image.selector.ts`        | 잘못된 URL을 건너뛰며 사이트 조건에 맞는 이미지 후보를 찾는다.         |

`LinkContentService.resolveContent` 한 곳에서 네 수집 방식의 실행 흐름을 확인할 수 있다.

## 사이트 지원 추가

먼저 실제 실패 URL과 필요한 결과를 확인한 뒤 아래 중 하나를 선택한다.

### HTML 요청 설정만 다른 경우

기본 HTML 수집으로 충분하고 User-Agent만 다르면
`html/link-content-html-request.policy.ts`에 도메인 조건을 추가한다. 정확한 hostname과
유사 위장 도메인을 함께 테스트한다.

### 기존 수집 방식으로 처리 가능한 경우

1. `strategy/site/`에 사이트 규칙 파일을 만든다.
2. `supports`에 정확한 hostname과 지원 경로를 선언한다.
3. `html`, `oembed`, `youtube`, `tinyfish` 중 사용할 방식을 지정한다.
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
이미지 선택, 제목 후처리는 각 사이트 규칙에서 담당한다.

Instagram 게시물·Reel·TV는 captioned embed를 한 번 조회하고 반환된 Markdown에서
작성자 캡션을 추출한다. 제목은 캡션 첫 줄 최대 100자다. 프로필은 원본 URL과 제목을 유지한다.

API key가 없으면 HTML로 다시 시도한다. API key가 있는데 TinyFish 요청이 실패하면
불완전한 HTML/OG 결과와 합쳐 성공처럼 반환하지 않는다.

TinyFish의 `image_links`는 대표 이미지 순서를 보장하지 않는다. 지원 사이트를 추가할
때는 실제 URL 여러 건의 응답 이미지를 확인하고, 사이트 규칙의 `selectImage`에 검증할 수
있는 조건을 작성한다. 배열의 첫 이미지를 그대로 사용하지 않는다.

## Behance 프로젝트

공개 프로젝트와 `be.net/gallery/...` 공유 링크를 canonical `www.behance.net` URL로
정규화해 TinyFish에 한 번 요청한다. 공식 oEmbed와 embed는 저장 후 분석에 필요한
프로젝트 본문을 제공하지 않아 원본 프로젝트를 사용한다.

본문과 이미지는 `.project-content-wrap`으로 제한한다. 대표 이미지는 그 안의 Behance
`/project_modules/` HTTPS 이미지 중 첫 후보이며, avatar·추천 카드만 있으면 null이다.
공개 프로젝트 3건에서 575~874KB HTML, 선택자, 단일·다중 이미지 경로를 확인했다.

preview와 collect는 각각 요청 1회다. TinyFish key가 없으면 기존 HTML 경로를 사용한다.
비공개·로그인 필요·성인 콘텐츠 확인 화면과 DOM 변경은 지원을 보장하지 않는다.

## 네이버 지도·플레이스

네이버 장소 URL은 `naver-place` 전략으로 모바일 `m.place.naver.com/place/{id}/home`에
정규화한 뒤 기존 TinyFish 클라이언트로 수집한다. PC entry/search의 장소 상세 경로,
플레이스 상세 경로와 `/share?id=`를 지원한다. 장소를 특정할 수 없는 검색·길찾기는
기존 HTML 처리를 유지한다.

TinyFish가 활성화된 환경에서는 `naver.me`를 전략 선택 전에 수동 리다이렉트로 해석한다.
공개 URL 검사, 5초 제한, 리다이렉트 횟수 제한을 적용하며 최종 URL로 전략을 선택한다.
네이버 이외 링크에 대한 일반적인 전략 재선택 기능을 추가한 것은 아니다.

제목에서 `: 네이버`와 제어 문자를 제거한다. 사진은 `search.pstatic.net/common/`의
`w560_sharpen` 후보 중 `ldb.phinf.naver.net`, `ldb-phinf.pstatic.net` 원본을 우선하며,
없으면 허용된 리뷰·블로그·클립 후보를 사용한다. 후보가 없으면 null이다. 이는 관측된
URL 규칙이며 모든 장소에서 네이버 첫 사진과 일치한다는 보장은 없다.

TinyFish 키가 없을 때는 기존 HTML 경로를 사용한다. 공통 TinyFish 경로와 동일하게
대상 robots.txt를 별도로 조회하지 않는다. 로딩·공통 화면은 빈 결과로 처리되며,
일시적인 로딩 실패의 자동 재시도 구분은 아직 보완이 필요하다.

### Instagram 게시물·릴스 캡션 수집

일반 게시물(`/p/`)과 릴스(`/reel/`, `/reels/`), `/tv/`는 TinyFish에 원본 URL 대신
`/{kind}/{shortcode}/embed/captioned/`를 한 번 요청한다. `/reels/`는 `/reel/`로 정규화한다.
추가 원본 조회나 이미지 보완 요청은 없다. 프로필은 기존 원본 수집 방식을 유지한다.

captioned 응답의 `title`은 `Instagram`, `description`은 null일 수 있다. 캡션은 별도 필드가
아니라 `text`의 일부이므로 `instagram-caption.parser.ts`가 작성자·좋아요·댓글 링크·버튼의
경계를 확인해 작성자 글만 추출한다. 음악·재생 버튼·프로필 카드와 Markdown 배지·줄바꿈
변형을 처리하며, 캡션 안에 같은 문구가 있다는 이유만으로 삭제하지 않는다.

- 제목: 캡션 첫 줄 최대 100자(이모지 코드 포인트 보존)
- DB 저장: 기존 `metadata.description`에 캡션 최대 2,000자
- AI 입력: `description`에 캡션 최대 2,000자를 전달하며, 중복되는 `content`는 수집 단계에서 null로 둔다.
  공통 분석 흐름은 설명 또는 본문이 있으면 실행한다. 별도 Instagram AI 처리기나 본문 컬럼은 추가하지 않는다.
- 캡션 없음 또는 형식 식별 실패: 제목·설명·본문은 null. UI 문구를 대신 저장하거나 분석하지 않는다.

이미지는 기존 사이트별 규칙으로 선택한다. 릴스는 허용된 HTTPS CDN의 콘텐츠 이미지에서
대상 shortcode의 미디어 ID와 `ig_cache_key`를 비교한다. 관측된 `미디어 ID + 17자리 보조 식별자`
형식은 전체 길이와 숫자 형식까지 검사한다. 보조 식별자를 이미지 파일명 ID와 동일하다고
가정하지 않는다. 일반 게시물은 기존 `ig_cache_key` 후보 선택을 유지한다. 캐러셀의 자식 이미지
ID는 게시물 ID와 다르므로 릴스 ID 규칙을 적용하지 않는다. 대표 이미지 한 개만 사용한다.

최종 이미지는 공개 URL·길이 검증을 거친다. TinyFish 요청이 실패하면 기존 오류·재시도 정책을
따르며, 요청당 기존 25초 제한을 사용한다. embed 이미지와 캡션 경계는 관측에 기반한 규칙이므로
Instagram 응답 형식·언어가 바뀌면 재검증이 필요하다. API key가 없는 환경의 HTML 대체 수집
정책은 기존과 같다.

## X 게시물 수집 최적화

X 게시물은 기존 TinyFish 요청 한 번을 유지하면서 `include_selectors`로 요청한 게시물 ID를
가리키는 article을 수집한다. ID 뒤의 쿼리·fragment·슬래시·미디어 경로도 허용한다.
중첩 article과 다른 게시물 사진 링크는 제외한다. 이 범위 설정은
X 게시물에만 적용하며 프로필·Instagram·일반 HTML 수집에는 적용하지 않는다.

본문은 첫 작성자 블록의 마지막 게시 시각 앞까지 추출한다. 반복 article을 구분하여
본문 중간의 일정 문구를 게시 시각으로 오인하지 않는다. 본문과 메타 설명이 대응하면
잘리지 않은 본문을 우선한다. 제목은 본문 첫 줄 최대 100자(코드 포인트 기준)다.
본문 경계나 메타 설명의 대응을 확인할 수 없으면 메타 설명을 사용한다. 설명도 없으면
텍스트는 null로 두고 수집한 이미지를 반환한다. 본문과 자체 이미지 모두 없을 때만
재시도 가능한 TinyFishFetchError를 반환한다.
`selector_not_matched`도 기존 제한 횟수 내에서 재시도한다. 로그인·비공개 등의 기존 영구 실패
분류는 유지한다.

`twitter.com`, 추적 쿼리, `/photo/N` 등은 같은 X 게시물 요청 URL로 정규화한다. 사진 선택 시
요청한 `/photo/N` 링크 안에 이미지 요소가 있으면 해당 링크의 사진만 남기도록 수집 범위를 제한한다.
빈 링크만 있는 로딩 상태에서는 다른 자체 미디어를 남긴다.
`image_links` 배열 위치를 사진 순번으로 해석하지 않는다. 지정 링크가 없으면 같은 게시물의
남은 미디어를 사용하며, 이 대체 선택의 순서는 보장하지 않는다. 인용·댓글 이미지로는 대체하지 않는다. 게시물에 사진이 없으면 썸네일은 null이다.

설명은 최대 2,000자 저장용으로, 본문은 최대 16,000자 AI 입력용으로 기존 collect 제한을 따른다.
네트워크 timeout·크기 제한·이미지 공개 URL 검증 및 TinyFish 키가 없을 때의 HTML 대체 경로를
유지한다. 새 API 키나 외부 공급자는 추가하지 않는다.

현재 본문 경계 파서는 관측한 영어·한국어 시각 형식을 처리한다. X DOM이나 시각 표기 변경,
인용글의 다른 구조와 혼합 미디어는 추가 검증이 필요하다. 일반 영상 포스터는 공개 표본으로 검증했다.

X 게시물은 자체 미디어만 썸네일로 사용한다. 자체 이미지가 없으면 null을 반환하며
인용 사진을 추가 조회하거나 계정 avatar로 대체하지 않는다. 정상 수집은 TinyFish 요청
1회로 끝난다. 프로필 URL은 피드를 제외하고 계정 avatar를 선택한다. 만료 토큰이 필요한
라이브 replay 이미지는 현재 URL 저장 구조에서 사용하지 않는다.
