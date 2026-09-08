# Instagram Reel 표지 보완 검증 — 2026-09-08

## 변경 내용

- 원본 TinyFish 수집 결과에 대상 릴스 표지가 없을 때 `/reel/{shortcode}/embed/`를 추가 조회한다.
- 제목·설명·본문은 원본 결과를 유지하며 embed에서는 이미지만 사용한다.
- 허용된 HTTPS CDN의 콘텐츠 이미지에서 캐시 키의 미디어 ID를 대상 shortcode와 비교한다. 실제 관측된 `미디어 ID + 17자리 보조 식별자` 형식은 전체 길이와 숫자 형식도 검사한다. 보조 식별자는 파일명 ID와 같다고 가정하지 않는다.
- 원본 수집 실패·수집 불가에는 추가 요청하지 않는다. 보완 요청만 실패하면 원본 결과를 유지하고 이미지는 null로 둔다. 이미지 보완 실패만을 위한 큐 재시도는 없다.

## 실제 서비스 호출 결과

실제 `LinkContentService.preview()`와 `collect()`를 호출했다. TinyFish 클라이언트와 공개 URL 검증을 대체하지 않았으며, 반환된 이미지 URL에 HEAD 요청을 보냈다. DB 저장과 AI 호출은 실행하지 않았다. 시간은 이미지 HEAD 요청까지 포함한다.

| URL | 경로 | 표지 | 이미지 HTTP | 시간 |
| --- | --- | --- | --- | --- |
| [릴스 DX7lzTOJ1p6](https://www.instagram.com/reel/DX7lzTOJ1p6/) | preview | 반환 | 200 / image/jpeg | 12.32초 |
| [릴스 DX7lzTOJ1p6](https://www.instagram.com/reel/DX7lzTOJ1p6/) | collect | 반환 | 200 / image/jpeg | 15.43초 |
| [릴스 DdAIb1EplDo](https://www.instagram.com/reel/DdAIb1EplDo/) | preview | 반환 | 200 / image/jpeg | 12.00초 |
| [릴스 DdAIb1EplDo](https://www.instagram.com/reel/DdAIb1EplDo/) | collect | 반환 | 200 / image/jpeg | 14.76초 |
| [릴스 Dc9DJx2p3Dl](https://www.instagram.com/reel/Dc9DJx2p3Dl/) | preview | 반환 | 200 / image/jpeg | 9.80초 |
| [릴스 Dc9DJx2p3Dl](https://www.instagram.com/reel/Dc9DJx2p3Dl/) | collect | 반환 | 200 / image/jpeg | 11.18초 |
| [릴스 DUa5b_BDmmD](https://www.instagram.com/reel/DUa5b_BDmmD/) | preview | 반환 | 200 / image/jpeg | 7.82초 |
| [릴스 DUa5b_BDmmD](https://www.instagram.com/reel/DUa5b_BDmmD/) | collect | 반환 | 200 / image/jpeg | 10.47초 |

8회 모두 원본 제목과 표지가 반환됐으며, collect 4회 모두 원본 본문이 유지됐다. 첫 3건은 동일 작성자의 릴스이고 마지막 1건은 저장소의 기존 검증 기록에서 가져왔다. 이 표본으로 전체 Instagram 성공률을 보장할 수는 없다.

## 자동 검증

- Jest: robots.txt 변경을 제외한 별도 PR 브랜치에서 49 suites, 343 tests 통과
- TypeScript: `tsc -p tsconfig.build.json` 통과
- 변경한 TypeScript 파일 ESLint 통과
- 원본 텍스트 보존, 추가 요청 생략, 보완 오류·수집 불가, 다른 릴스 후보, 미디어 ID 접두사 오탐, CDN 위장, HTTP·프로필 이미지 제외를 검증했다.

## 제한

- 캐시 키 형식과 embed 이미지 제공은 관측에 기반한 동작이다. 형식 변경 시 표지가 null로 남을 수 있으므로 재검증이 필요하다.
- 추가 TinyFish 요청으로 지연이 늘어난다. 보완 요청에는 기존 25초 제한이 적용된다.
- Instagram CDN URL 만료 문제와 영상의 음성·장면 분석은 이번 변경 범위에 포함하지 않는다.
- robots.txt 정책 변경은 별도 PR #121에서 다루며 이 PR에는 포함하지 않는다. 배포하지 않았다.
