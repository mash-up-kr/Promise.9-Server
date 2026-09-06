# 링크 리마인드 이메일

현재 발송용 `link-reminder-email.html`은 Figma E-mail 페이지의 본문 디자인을 구현합니다.
메일 앱의 뒤로 가기·발신자 정보 등은 수신 앱이 표시하므로 HTML에 포함하지 않습니다.

- 디자인: https://www.figma.com/design/g4STf8Sl2f7y6oYyGn69QP?node-id=5288-110774
- 라이트 기본 + `prefers-color-scheme: dark` 대응
- 노란 브랜드 배너, 예약 시간, 링크 제목, 폴더·도메인·저장일, 메모, 원문·AI 요약 버튼, 문의 푸터
- 480px 이하에서는 메타정보와 버튼을 세로로 배치합니다.
- 메모가 없으면 안내 문구와 ‘메모 작성하기’ 링크를 표시합니다.
- 폴더 색상 13종은 `reminder-folder-colors.json`의 Figma 팔레트를 사용합니다.

## 서버 데이터와 버튼

`src/modules/link/reminder/reminder-email.template.ts`가 수신자별 전체 치환값을 만듭니다.
제목·폴더명·메모·URL은 HTML escape하며, 일반 텍스트 본문에는 원문을 사용합니다.
예약 시간과 저장 날짜는 `Asia/Seoul` 기준입니다. 폴더가 없으면 ‘미분류’와 중립 색상을 사용합니다.

| 버튼 | 목적지 |
| --- | --- |
| 원문 보러 가기 / 도메인 | `finalUrl` 우선, 없으면 `originalUrl` |
| 링띵동에서 보기 / 별 / 메모 작성하기 / AI 요약 함께 보기 | `https://link-ding-dong.com/link/{linkId}` |
| 브랜드 배너 | `https://link-ding-dong.com` |
| 문의 | `mailto:promise.9@gmail.com` |

별 버튼은 메일에서 즐겨찾기를 변경하지 않고 상세 화면을 엽니다.
AI 요약 섹션 자동 스크롤은 이번 범위에 포함하지 않습니다.
로컬 웹 저장소의 상세 화면은 확인 당시 목업 데이터 기반이므로 실제 상세 조회·편집은 웹 연동 작업이 필요합니다.

## 이미지

`assets/reminder/`의 배너·로고·아이콘은 Figma 노드에서 내보낸 파일입니다.
폴더 편집 원본은 `assets/reminder/folder.svg` 하나로 관리합니다. `currentColor`에 `reminder-folder-colors.json`의 `lightIcon`/`darkIcon` 색상을 적용하고 `lightIconOpacity`/`darkIconOpacity`를 path의 `fill-opacity`에 적용하면 각 변형을 만들 수 있습니다. 다크 모드 중립 아이콘은 흰색 50% 투명도입니다.
발송에는 메일 앱 호환성을 위해 색상 13종 × 테마 2종의 PNG를 사용합니다. 현재 PNG는 Figma에서 내보낸 결과를 유지하며, 원본을 수정할 때는 14×14 SVG를 28×28 PNG로 내보내 해당 파일을 갱신합니다.
`EMAIL_ASSET_BASE_URL`이 설정되면 서버가 `cid:reminder-*` 참조를 버전별 CloudFront HTTPS URL로 바꾸고 첨부를 생략합니다. 설정이 없으면 해당 PNG를 기존 방식으로 인라인 첨부합니다.
이미지 배포·환경변수 설정은 [공용 정적 에셋](../docs/infrastructure/assets.md)을 참고합니다. 만료되는 Figma URL은 사용하지 않습니다. Docker 이미지에도 이 디렉터리와 팔레트를 복사합니다.
기존 모션 GIF·포스터는 과거 시안 에셋으로 보존하며 현재 발송에는 사용하지 않습니다.

## 로컬 미리보기

```bash
python3 -m http.server 4174 --bind 127.0.0.1 --directory email
```

http://127.0.0.1:4174/link-reminder-email-preview.html

미리보기에서 테마, 메모 유무·길이, 폴더명 길이, 폴더 색상, 481/375/320px 너비를 선택할 수 있습니다.
샘플 데이터는 브라우저 미리보기에만 사용됩니다. 실제 메일은 서버 조회 데이터를 사용합니다.

## 검증 범위

브라우저 미리보기와 단위 테스트로 레이아웃 및 데이터·CID 연결을 검증합니다.
실제 SES 발송과 Gmail·Outlook·Apple Mail 수신 검증은 별도로 필요합니다.
메일 클라이언트의 웹폰트·다크 모드·모서리 라운드 지원에 따라 표현이 달라질 수 있습니다.
