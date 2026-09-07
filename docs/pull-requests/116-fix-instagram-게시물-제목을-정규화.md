# PR #116: [fix] Instagram 게시물 제목을 정규화

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/116
- Author: @vcz-Chan
- Base: main
- Head: fix/instagram-post-title
- Merged: 2026-09-07T11:30:06Z

## PR Body

## 📌 개요

Instagram 게시물에는 별도의 제목 필드가 없어, TinyFish가 `{작성자} on Instagram: "{캡션 전체}"` 형태의 문서 제목을 반환합니다. 기존에는 이 값을 최대 512자까지 그대로 사용해 긴 캡션과 작성자 표기가 미리보기 제목에 노출됐습니다.

Instagram 사이트 전략에서 게시물 제목을 후처리해, 작성자 표기를 제거한 캡션 첫 줄을 최대 100자로 사용하도록 변경합니다.

## ✅ 작업 내용 및 변경 사항

- [x] TinyFish 사이트 전략에 선택적인 `normalizeTitle` 후처리 추가
- [x] Instagram 게시물·Reel·TV 제목에서 `on Instagram:` 앞의 작성자 표기 제거
- [x] 캡션의 첫 번째 비어 있지 않은 줄을 제목으로 사용
- [x] Instagram 게시물 제목을 최대 100자로 제한
- [x] 작성자 정보가 핵심인 Instagram 프로필 제목은 기존 값 유지
- [x] `preview`와 저장 후 콘텐츠 수집에 같은 제목 정책 적용
- [x] 사이트 전략 단위 테스트와 서비스 연결 테스트 추가
- [x] 링크 콘텐츠 수집 문서에 Instagram 제목 정책 추가

## 🔍 변경 전후

대상 링크: https://www.instagram.com/p/DW04l9PES8g/

```text
변경 전
브이지피 서울 on Instagram: "자양동 골목이 요즘 그렇게 핫하다고 해서 다녀왔는데, 진짜 핫했던 썰 푼다..

칼레오커피로스터스
서울 광진구 ..."

변경 후
자양동 골목이 요즘 그렇게 핫하다고 해서 다녀왔는데, 진짜 핫했던 썰 푼다..
```

| URL 유형 | 제목 처리 |
| --- | --- |
| `/p`, `/reel`, `/reels`, `/tv` | 작성자 표기를 제거하고 캡션 첫 줄을 최대 100자로 사용 |
| Instagram 프로필 | TinyFish가 반환한 기존 제목 유지 |
| 제목이 없는 경우 | `null` 유지 |
| 예상한 Instagram 제목 형식과 다른 경우 | 원래 제목을 최대 100자로 제한 |

## 💬 리뷰어에게

- 제목 후처리는 Instagram 사이트 전략에만 두어 X와 다른 TinyFish 대상에는 영향을 주지 않습니다.
- X·Threads 및 다른 사이트의 제목 형식과 공통 길이 정책은 실제 응답을 확인한 뒤 다음 PR에서 다룹니다.
- 이번 PR은 제목 표시 문제만 다룹니다. TinyFish `text`에 포함될 수 있는 로그인 안내·댓글 등의 본문 정제는 별도 검증이 필요한 범위라 변경하지 않았습니다.
- Instagram의 문서 제목 형식을 인식하지 못하더라도 기존 제목을 제한된 길이로 반환하도록 폴백합니다.

## 🧪 검증

- 전체 테스트 `308 pass`, `0 fail`
- 링크 콘텐츠 테스트 `77 pass`, `0 fail`
- TypeScript 빌드 통과
- ESLint 오류 `0개` (기존 경고 `2개`)
- `git diff --check` 통과
