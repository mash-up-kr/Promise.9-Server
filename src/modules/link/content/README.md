# 링크 콘텐츠 수집

링크 콘텐츠 모듈은 저장 전 미리보기와 저장 후 분석에 필요한 제목, 설명, 본문,
대표 이미지를 수집한다. 외부 URL 요청은 항상 `UrlSecurityService`의 공개 URL 검증을
거치며, 리다이렉트도 각 단계에서 다시 검증한다.

## 구성

- `link-content.service.ts`: 수집 흐름을 실행하고 공통 보안·길이 제한을 적용한다.
- `link-content.parser.ts`: HTML에서 OG 정보와 본문을 추출한다.
- `strategy/link-content-strategy.type.ts`: 수집 방식별 사이트 설정 타입을 정의한다.
- `strategy/link-content-strategy.registry.ts`: URL에 맞는 사이트 전략을 선택한다.
- `strategy/site/`: 사이트별 URL 범위와 수집 설정을 소유한다.

사이트 전략의 `kind`는 우선 사용할 수집 방식을 나타낸다.

- `html`: 대상 페이지의 HTML을 직접 요청해 OG와 본문을 파싱한다.
- `oembed`: 사이트의 oEmbed를 먼저 요청하고 실패하면 HTML 수집으로 돌아간다.

`preview`는 저장 전 응답 속도를 위해 robots.txt를 조회하지 않는다. `collect`는 본문을
AI 입력으로 사용하므로 페이지 요청 전에 robots.txt 허용 여부를 확인한다.

## 사이트 추가

1. `strategy/site/`에 사이트 파일을 만든다.
2. 정확한 호스트와 지원 URL 범위를 `supports`에 선언한다.
3. 수집 방식에 맞는 `kind`와 설정을 지정한다.
4. 기본 전략보다 앞서 평가되도록 registry에 등록한다.
5. 정상 URL과 유사 도메인·로그인 URL 같은 제외 대상을 registry 테스트에 추가한다.

사이트별 파일에는 해당 사이트에서만 달라지는 정책만 둔다. 타임아웃, 리다이렉트,
응답 크기, SSRF 방어 같은 공통 네트워크 정책은 사이트 파일에서 구현하지 않는다.

## 현재 전략

| 사이트 | 수집 방식 | 실패 시 동작 |
| --- | --- | --- |
| 기본 | HTML | 수집 오류 반환 |
| Brunch | 전용 User-Agent를 사용한 HTML | 수집 오류 반환 |
| YouTube | oEmbed | HTML 수집으로 전환 |
