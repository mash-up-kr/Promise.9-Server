# YouTube Data API 우선 수집 전후 비교

이 변경은 속도보다 AI 분석·검색에 사용할 영상 설명 확보를 위한 것이다.
제목·썸네일만 필요한 미리보기는 기존 oEmbed → HTML을 유지하고, 저장 후 수집만
Data API → oEmbed → HTML로 바꾼다. 기존 `purpose` 구분으로 호출 순서를 결정한다.
최종 코드 재측정에서 미리보기 중앙값은 거의 같았고, 저장 수집은 약 15ms 증가했다.

## 비교 대상과 동작

기준 커밋은 `main`의 `4c0988f3a895ce72fa47135d4a6d427946240652`다.
동일한 `LinkContentService.preview()`·`collect()`를 전후 코드에서 직접 실행했다.
Instagram 변경과 미리보기 robots.txt PR #121은 포함하지 않는다.

| 항목 | 변경 전: main | 변경 후 |
| --- | --- | --- |
| 미리보기 우선 수집 | oEmbed | oEmbed (Data API 호출 없음) |
| 저장 후 우선 수집 | oEmbed | YouTube Data API `videos.list(part=snippet)` |
| 저장 후 제목 | oEmbed 제목 | API의 `snippet.title` |
| 썸네일 | oEmbed 제공 URL | 미리보기: oEmbed / 저장: maxres → standard → high → medium → default |
| 영상 설명 | oEmbed 성공 시 없음 | `snippet.description`을 최대 2,000자로 제한 |
| 설명 저장·AI 입력 | `description: null` | 기존 `metadata.description` 저장과 AI `description` 입력 사용 |
| 영상 본문·자막 | oEmbed 성공 시 `content: null` | 모든 YouTube 경로에서 `content: null` |
| 정상 수집의 외부 HTTP 호출 | 작업마다 1회 | 작업마다 1회 |
| 미리보기 후 저장 | oEmbed 총 2회 | oEmbed 1회 + Data API 1회; 캐시 재사용 없음 |
| 실패 시 | oEmbed → HTML | 미리보기: 기존과 동일 / 저장: Data API → oEmbed → HTML |
| 설정 | 별도 API 키 없음 | 선택적 `YOUTUBE_API_KEY`; 없으면 oEmbed 사용 |

미리보기는 설명을 요청하지 않고 제목·썸네일·출처만 반환한다. 저장 수집만 Data API를
사용하므로 정상 경로에서 미리보기+저장은 1 unit을 사용한다. 다른 호출이 없다면 기본
10,000 units로 하루 약 10,000건의 저장 수집이 가능하다는 계산이다. oEmbed 자체의
서비스 제한을 의미하지 않는다. 아래 속도 수치는 실제 main과 최종 구현의 비교다.

## 속도 측정

- 측정일: 2026-09-08, macOS arm64 로컬 환경, Node.js v24.17.0.
- 영상 2개 × 작업 2종 × 전후 각 10회 = 측정 80건. 모두 성공했다.
- 각 영상·작업·구현의 준비 호출 1회씩 총 8건은 통계에서 제외했다.
- 같은 프로세스에서 순차 실행하며 전후 호출 순서를 회차마다 교대했다.
- 서비스 호출부터 응답 본문 읽기·파싱·이미지 공개 URL 검증이 끝날 때까지 측정했다.
- HTTP 컨트롤러·DB 저장·이미지 다운로드·색상 추출·LLM·큐 대기 시간은 포함하지 않는다.
- 최종 목적별 분리를 적용하고 테스트·빌드를 마친 뒤 재측정했다. 이전 양쪽 Data API 우선 측정값은 현재 결과로 대체했다.

아래 각 행은 영상 2개의 측정 20건을 합한 값이다. p95는 정렬 후 nearest-rank로 계산했다.

| 작업 | 이전 중앙값 | 이후 중앙값 | 차이 | 이전 p95 | 이후 p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 미리보기 | 83.05ms | 84.10ms | +1.05ms (+1.3%) | 98.8ms | 92.1ms |
| 저장 후 수집 | 83.10ms | 98.45ms | +15.35ms (+18.5%) | 85.8ms | 108.9ms |

표본 수가 작고 외부 API·로컬 네트워크·연결 재사용의 영향을 받는다. 운영 서버의
응답 시간이나 장애율을 보장하는 수치로 해석하지 않는다. 정상 경로만 실측했으며,
저장 수집의 Data API 타임아웃 후 폴백은 기존 대비 최대 약 5초의 대기가 추가될 수 있다.
미리보기는 Data API를 호출하지 않아 해당 API의 지연·할당량 오류 영향을 받지 않는다.

## 실제 저장 수집 결과

| 영상 | 제목 | 이전 설명 | 이후 설명 | 이전 썸네일 | 이후 썸네일 |
| --- | --- | --- | --- | --- | --- |
| [8Pbt-Aum5Q4](https://www.youtube.com/watch?v=8Pbt-Aum5Q4) | 식인섬에서 살아남기 | 없음 | 84자 | hqdefault.jpg | maxresdefault.jpg |
| [rfscVS0vtbw](https://www.youtube.com/watch?v=rfscVS0vtbw) | Learn Python - Full Course for Beginners [Tutorial] | 없음 | 2,000자(기존 상한 적용) | hqdefault.jpg | maxresdefault.jpg |

두 영상 모두 제목은 같았고, 썸네일은 API가 제공한 maxres 후보를 선택했다.
이전 40건은 oEmbed만 호출했다. 이후 미리보기 20건은 oEmbed만, 저장 수집 20건은
Data API만 호출했다. 미리보기 썸네일은 전후 모두 hqdefault.jpg였다. 본문은 전후 모두 null이다.
설명 원문과 중복된 `content`는 만들지 않는다.

## 검증 및 배포

- 전체 Jest: 51개 suite, 365개 test 통과.
- 전체 ESLint: 오류 0개. 기존 `link.repository.spec.ts`, `link.service.spec.ts` 경고 각 1개.
- TypeScript 빌드, infra typecheck 통과.
- 로컬 AWS 기본 계정과 프로젝트 계정이 달라 최초 synth가 거부됐다. 로컬 자격 증명과
  프로필을 제외하고 `--lookups=false`로 오프라인 synth를 실행해 통과했다. 인프라 배포는 하지 않았다.
- 자동 테스트에서 키 미설정·영상 미조회·403/429/5xx·잘못된 JSON·타임아웃·키 노출 방지,
  API → oEmbed → HTML 폴백, 영상 URL 형식, 이미지 공개 URL 검증과 설명 길이를 확인했다.
- 운영에서는 GitHub Actions secret `YOUTUBE_API_KEY` 설정이 필요하다. workflow는 값이
  있을 때만 서버 환경변수에 전달한다. 키가 없으면 기존 oEmbed로 계속 동작한다.

## 재현

[측정 스크립트](../../test/manual/youtube-content-benchmark.cjs)와
[키를 제외한 원시 결과](youtube-data-api-benchmark-2026-09-08.jsonl)를 함께 보관한다.
baseline 경로에 기준 커밋의 `src`, `tsconfig.json`, 설치된 `node_modules`를 준비한다.
현재 작업 디렉터리에서도 의존성이 설치돼 있어야 한다.

```sh
YOUTUBE_BASELINE_ROOT=/path/to/baseline \
YOUTUBE_BASELINE_COMMIT=4c0988f3a895ce72fa47135d4a6d427946240652 \
YOUTUBE_BENCH_ENV_FILE=/path/to/local/.env \
node test/manual/youtube-content-benchmark.cjs > /tmp/youtube-benchmark.json
```

환경 파일에서는 YouTube 키만 읽으며 출력에 키나 요청 쿼리 문자열을 포함하지 않는다.
최종 코드에서 한 번 실행하면 준비 호출을 포함해 Data API 22회, oEmbed 66회를 요청한다.
