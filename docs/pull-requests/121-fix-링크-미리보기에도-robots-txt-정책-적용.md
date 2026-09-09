# PR #121: [fix] 링크 미리보기에도 robots.txt 정책 적용

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/121
- Author: @vcz-Chan
- Base: main
- Head: fix/link-preview-robots
- Merged: 2026-09-09T10:29:21Z

## PR Body

## 📌 개요
기존에는 미리보기에서 robots.txt를 확인하지 않고 저장 후 수집에서만 확인해, 미리보기에는 제목·썸네일이 표시되지만 실제 저장 후에는 정보를 수집하지 못하는 등 결과가 달라질 수 있었습니다. 이 불일치를 줄이기 위해 미리보기에서도 HTML 요청 전에 robots.txt 허용 여부를 확인하도록 두 경로의 정책을 맞췄습니다.

## ✅ 작업 내용 및 변경 사항
- [x] HTML 수집 시 미리보기와 저장 후 분석 모두 `respectRobots: true` 적용
- [x] robots.txt 차단 시 제목·썸네일이 null인 미리보기 반환 검증
- [x] 일반 링크·Brunch·리다이렉트·HTML 대체 수집 테스트의 요청 순서 갱신
- [x] 링크 콘텐츠 수집 문서 갱신

## 💬 리뷰어에게
HTML 경로의 동작 변경입니다. robots.txt 허용 여부를 확인하므로 미리보기에도 추가 요청 시간이 발생하며, robots.txt 조회 오류는 기존 HTML 수집기의 오류 처리 정책을 따릅니다. YouTube oEmbed와 TinyFish 경로는 변경하지 않습니다.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
- 명시적으로 차단된 경우 HTML을 요청하지 않고 `title: null`, `thumbnailUrl: null`, 입력 URL의 `source`를 반환합니다.
- HTML 리다이렉트 목적지에서도 기존 fetcher를 통해 robots.txt를 검사합니다.
- PR 커밋만 추출한 별도 디렉터리에서 콘텐츠 관련 Jest 8 suites / 78 tests 통과를 확인했습니다.
- 커밋 훅 ESLint 통과.
