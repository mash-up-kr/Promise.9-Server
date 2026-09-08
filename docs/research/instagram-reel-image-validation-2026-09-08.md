# Instagram 게시물·릴스 캡션 수집 검증 — 2026-09-08

## 최종 동작

- 일반 게시물과 릴스 모두 TinyFish `/embed/captioned/`를 한 번 조회한다.
- 응답 `text`에는 캡션과 UI 문구가 함께 있다. 캡션 경계를 식별해 작성자 글만 사용한다.
- 제목은 캡션 첫 줄 최대 100자, DB `metadata.description`은 캡션 최대 2,000자다. AI에도 같은 description을 전달하며, 중복되는 content는 수집 단계에서 null로 둔다. 별도 Instagram AI 처리기는 없다.
- 캡션 경계를 식별하지 못하거나 캡션이 없으면 제목·설명·본문은 null로 반환하고 AI 분석 불가를 표시한다. UI 문구나 원본 메타데이터를 대신 저장하지 않는다.
- 프로필은 기존 원본 URL 수집을 유지한다. 별도 DB 컬럼이나 마이그레이션은 없다.

## 실제 서비스 호출

실제 `LinkContentService.preview()`와 `collect()`를 호출하고 TinyFish 호출 횟수·URL을 기록했다. 반환된 이미지에는 HEAD 요청을 보냈다. DB 저장·AI 호출은 실행하지 않았다. 아래 시간은 이미지 HEAD 요청까지 포함한다. 기존 TinyFish 캐시 설정을 사용했으므로 고정 성능이나 캐시 없는 지연을 의미하지 않는다.

| URL | 경로 | TinyFish 요청 | 캡션 기반 제목 | 이미지 HTTP | 시간 |
| --- | --- | --- | --- | --- | --- |
| [DX7lzTOJ1p6](https://www.instagram.com/reel/DX7lzTOJ1p6/) | preview | 1회 | 반환 | 200 | 2.06초 |
| [DX7lzTOJ1p6](https://www.instagram.com/reel/DX7lzTOJ1p6/) | collect | 1회 | 반환 | 200 | 11.81초 |
| [DdAIb1EplDo](https://www.instagram.com/reel/DdAIb1EplDo/) | preview | 1회 | 반환 | 200 | 2.65초 |
| [DdAIb1EplDo](https://www.instagram.com/reel/DdAIb1EplDo/) | collect | 1회 | 반환 | 200 | 1.29초 |
| [Dc9DJx2p3Dl](https://www.instagram.com/reel/Dc9DJx2p3Dl/) | preview | 1회 | 반환 | 200 | 1.55초 |
| [Dc9DJx2p3Dl](https://www.instagram.com/reel/Dc9DJx2p3Dl/) | collect | 1회 | 반환 | 200 | 1.34초 |
| [DUa5b_BDmmD](https://www.instagram.com/reel/DUa5b_BDmmD/) | preview | 1회 | 반환 | 200 | 1.37초 |
| [DUa5b_BDmmD](https://www.instagram.com/reel/DUa5b_BDmmD/) | collect | 1회 | 반환 | 200 | 1.27초 |
| [DW04l9PES8g](https://www.instagram.com/p/DW04l9PES8g/) | preview | 1회 | 반환 | 200 | 1.39초 |
| [DW04l9PES8g](https://www.instagram.com/p/DW04l9PES8g/) | collect | 1회 | 반환 | 200 | 1.41초 |
| [Dcyu9p5N9oy](https://www.instagram.com/p/Dcyu9p5N9oy/) | preview | 1회 | 반환 | 200 | 1.35초 |
| [Dcyu9p5N9oy](https://www.instagram.com/p/Dcyu9p5N9oy/) | collect | 1회 | 반환 | 200 | 1.33초 |

릴스 4건·일반 게시물 2건의 12회 호출 모두 한 번의 captioned 요청으로 제목과 표지가 반환됐다. collect 6회 모두 캡션과 DB 저장용 description이 일치했다(2,000자 제한 적용). 표본 중 릴스 3건은 같은 작성자다.

## 자동 검증

- 단일 요청 변경 시 Jest 전체 50 suites / 356 tests 통과
- content를 null로 정리한 최종 변경 후 수집·분석·AI 관련 16 suites / 173 tests 통과
- TypeScript 빌드와 변경 파일 ESLint 통과
- 게시물·릴스 단일 요청, 2,000자 제한, 프로필 유지, 이미지 없음·수집 실패에 추가 조회하지 않는 동작 검증
- 음악·재생 버튼·프로필 카드·인증 배지·빈 줄 없는 응답·이스케이프된 계정명 및 UI와 같은 문구를 포함한 캡션 회귀 테스트
- 캡션 없음·식별 불가 시 부가 정보가 저장용 설명에 들어가지 않는 동작 검증
- description만 있는 수집 결과도 DB에 캡션을 보존하고 공통 AI 요약·태그에 description과 content: null을 전달하는 동작 검증

## 제한

- 캡션 경계와 CDN 이미지 형식은 실제 관측에 기반한다. 응답 구조·언어 변경 시 추가 검증이 필요하다.
- 일반 게시물 이미지는 기존 `ig_cache_key` 후보 선택을 유지한다. 캐러셀 자식 이미지 ID에는 릴스의 게시물 ID 비교를 적용하지 않는다.
- 게시물의 모든 이미지 수집, CDN URL 만료 대응, 영상 음성·장면 분석은 별도 범위다.
- 전체 Instagram 성공률을 보장하는 검증은 아니며 배포하지 않았다.
