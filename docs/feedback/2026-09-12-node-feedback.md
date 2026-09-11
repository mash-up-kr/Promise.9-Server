# 2026-09-12 노드팀 피드백 처리

`피드백 문서 및 QA` 이슈 트래커(2026-09-09 기준)에서 담당 파트에 Node가 포함된 항목만 정리했다. 웹·디자인 단독 항목은 다루지 않는다. 통합 브랜치에는 완전히 해결된 항목만 넣었다.

<br>

## 1. 노드팀 task 정리

| # | 이슈 | 문서 상태 | 결과 |
| --- | --- | --- | --- |
| 1 | 목록 API에 `processingStatus` 추가 (to 웹 from 노드) | 제안 | 해결 |
| 2 | 링크 정규화 (Instagram 공유 파라미터로 중복 저장) | 시작 전 | 해결 |
| 3 | AI 요약에 외국어(깨진 글자)가 섞여 나옴 | 시작 전 | 해결 |
| 4 | 이미지 TTL 만료 문제 | 시작 전 | 이미 해결 (PR #136) |
| 5 | 검색에 관련 없는 결과, 최소 유사도 기준 확인 | 시작 전 | 이미 해결 (PR #133) |
| 6 | 검색에 AI 요약 텍스트 가중이 적은 것 같음 | 시작 전 | 이미 해결 (PR #133) |
| 7 | 링크를 저장했는데 제목·이미지 없이 AI 요약만 노출 | 시작 전 | 미해결 (부분 수정 브랜치만 있음) |
| 8 | 이미지가 안 떠요 (한 계정만 썸네일 없음) | 시작 전 | 미해결 (부분 수정 브랜치만 있음) |
| 9 | 썸네일(노잼)과 제목(무기력) 불일치, 노잼 검색 시 안 나옴 | 시작 전 | 미해결 |
| 10 | 회원 탈퇴 시 Apple revoke | 논의 필요 | 미해결 |
| 11 | 플레이스 홀더 문구 (제목이나 키워드를 입력해주세요) | 시작 전 | 노드 작업 없음 |

문서에 이미 `완료`로 표시된 Node 항목(폴더 링크 개수 반영 지연, 폴더 삭제 문구, 최근 삭제 9개 제한, 저장 날짜 하루 전 표시)은 제외했다. 담당 파트가 없는 논의 항목(가비지 컬렉션 지원)도 제외했다.

<br>

## 2. 브랜치 구성

| 브랜치 | 내용 | 통합 포함 |
| --- | --- | --- |
| `feat/link-list-processing-status` | 목록 응답에 `processingStatus` 추가 | 포함 |
| `fix/link-url-normalization` | URL 정규화 규칙 확장, 백필 스크립트 | 포함 |
| `fix/ai-summary-korean-only` | AI 요약·태그 한국어 문자 검사 | 포함 |
| `fix/link-title-fallback` | AI 대체 제목 생성 (한국어 검사 브랜치 위에 쌓음) | 제외 (부분 해결) |
| `fix/thumbnail-transient-dns-retry` | 썸네일 DNS 일시 실패 시 재시도 | 제외 (원인 미확정) |
| `feat/node-feedback-2026-09-12` | 포함 브랜치 3개를 합친 통합 브랜치 | - |

<br>

## 3. 해결된 것

- **목록 API `processingStatus`**: `GET /links` 각 항목에 상세와 같은 `processingStatus`(`PENDING`, `SUCCESS`, `FAILED`)를 추가했다. 검색 결과에도 포함되며 `NEEDS_REVIEW`는 상세처럼 `SUCCESS`로 감춘다. 필드 추가만이라 기존 앱과 호환된다. 웹은 제목 유무 대신 `PENDING` 여부로 polling 기준을 바꿀 수 있다.
- **링크 정규화**: 중복 판단 키에서 `utm_*`, `fbclid`, `igsh`, `igsi`, `img_index`, YouTube `si`·`feature` 같은 추적·공유 파라미터를 제거하고 남은 파라미터를 정렬한다. 쿼리가 있어도 경로 끝 `/`를 제거한다. Instagram 게시물은 `https://www.instagram.com/{p|reel|tv}/{shortcode}`로 통일한다. 기존 링크 키는 `bun run db:backfill:normalized-urls -- --dry-run`으로 충돌을 확인한 뒤 적용한다.
- **AI 요약 외국어**: 요약·태그를 NFC로 정규화한 뒤 결합되지 않은 한글 자모나 한자·일본어·키릴 문자가 남으면 재시도 가능한 실패로 던져 다시 생성한다. 프롬프트에도 다른 문자 체계 금지 규칙을 추가했다. 실제 링크 4건으로 검증했고 정상 요약에 오탐은 없었다.
- **이미 해결된 항목**: 이미지 TTL은 PR #136(9/11 머지)의 갱신 스케줄러가, 검색 관련성과 요약 가중치는 PR #133(9/9 저녁 머지)의 제목 0.30·요약 0.25 가중치와 동적 임계값이 반영했다. 피드백 스크린샷은 두 PR 머지 전 시각이다.

<br>

## 4. 해결 안 된 것

- **제목·이미지 없이 요약만 노출**: 제목은 `fix/link-title-fallback`에서 AI 대체 제목으로 채울 수 있지만, 본문만 수집된 링크의 대표 이미지는 만들 근거가 없어 이슈 전체를 해결하지 못했다. 브랜치는 통합에서 제외했다.
- **이미지가 안 떠요**: 운영 DB 없이 특정 계정의 원인을 확정할 수 없다. 원인 후보 하나(썸네일 DNS 확인 일시 실패 시 이미지가 조용히 누락)는 `fix/thumbnail-transient-dns-retry`에서 고쳤지만 실제 원인인지 확인되지 않아 통합에서 제외했다. 아래 조회로 해당 계정 링크의 `metadata.images`가 비어 있는지 먼저 확인해야 한다.

    ```sql
    select l.id, l.title, l.ai_summary_status, l.metadata->'images'->0->>'url' as thumbnail, l.created_at
    from links l
    where l.user_id = :userId
      and l.deleted_at is null
      and coalesce(jsonb_array_length(l.metadata->'images'), 0) = 0
    order by l.created_at desc;
    ```

- **썸네일·제목 불일치와 노잼 검색**: 검색은 제목, AI 요약, 태그, 메모, URL 텍스트만 대상으로 하며 썸네일 이미지 안의 글자는 읽지 않는다. OCR이나 이미지 캡셔닝 도입은 비용과 지연이 커 별도 결정이 필요하다. Instagram 캐러셀의 첫 이미지와 캡션이 다른 것은 원문 구조라 서버에서 맞출 수 없다.
- **Apple revoke**: 구현 PR #125는 draft 상태로 닫혀 있다. 배포에 `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENCRYPTION_KEY` 전달과 refresh token이 없는 기존 회원 처리 방식 결정이 필요해 팀 논의 후 진행한다.
- **플레이스 홀더**: 검색 입력창 문구라 서버 변경이 없다.

<br>

## 5. 배포 후 할 일

- 운영에서 `bun run db:backfill:normalized-urls -- --dry-run`을 실행해 충돌 목록을 확인하고, 문제가 없으면 `--dry-run` 없이 적용한다.
