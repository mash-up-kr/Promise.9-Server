# PR #67: [feature] 링크 리마인드 이메일 템플릿 및 모션 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/67
- Author: @vcz-Chan
- Base: main
- Head: feature/link-reminder-email
- Merged: 2026-08-10T13:27:15Z

## PR Body

## 📌 개요

저장한 링크를 다시 보여주는 링크 리마인드 이메일의 발송용 HTML 템플릿과 세 가지 최종 모션을 추가했습니다. 실제 발송 로직과 외부 에셋 배포는 이번 PR 범위에서 제외하고 후속 TODO로 문서화했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] `{{linkTitle}}`, `{{linkUrl}}`, `{{motionGifUrl}}` 기반 발송용 이메일 템플릿 추가
- [x] `normal`, `gentle`, `playful` 모션 GIF와 정적 포스터 fallback 추가
- [x] 세 모션을 선택할 수 있는 로컬 미리보기와 초기 모션 콘셉트 보존본 추가
- [x] 사용 방법, 발송 시 주의사항, CDN 배포 TODO 문서화

## 💬 리뷰어에게

세 모션의 시각적 완성도와 이메일 본문·카드의 가독성을 중점적으로 확인해주세요. 실제 발송 시에는 발송 코드에서 모션 하나를 선택하고 공개 HTTPS URL을 `{{motionGifUrl}}`에 주입해야 합니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

- 이메일 클라이언트에서 JavaScript에 의존하지 않도록 본문은 항상 읽을 수 있는 HTML로 구성했습니다.
- 애니메이션 미지원 환경은 정적 포스터와 Outlook VML fallback을 사용합니다.
- 검증: `bun test` 65개 통과, 미리보기 스크립트 문법 및 600×720 에셋 규격 확인
- 로컬 미리보기: `http://127.0.0.1:4174/email/link-reminder-email-preview.html`
