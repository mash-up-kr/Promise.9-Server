# 링크 리마인드 이메일

저장한 링크를 다시 보여주는 Promise.9 이메일 템플릿과 모션 에셋입니다.
서버의 링크 리마인더가 `link-reminder-email.html`을 읽어 실제 이메일 본문으로 사용합니다.

## 파일 구성

- `link-reminder-email.html`: 실제 발송용 HTML 템플릿
- `link-reminder-email-preview.html`: 세 모션을 선택할 수 있는 로컬 미리보기
- `assets/link-reminder-motion.gif`: 기본 모션 최종본
- `assets/link-reminder-motion-gentle.gif`: 부드러운 모션 최종본
- `assets/link-reminder-motion-playful.gif`: 타원 궤도 모션 최종본
- `assets/link-reminder-motion-poster.png`: 애니메이션 미지원 환경용 공용 포스터
- `assets/ddingddong.png`: 초기 콘셉트에서 사용하는 캐릭터 이미지
- `promise-light-motion-concept.html`: 초기 브라우저 모션 콘셉트 보존본

## 최종 모션 선택

세 변형은 모두 실제 발송에 사용할 수 있는 최종본입니다.

| 키 | 최종 에셋 | 상태 |
| --- | --- | --- |
| `normal` | `link-reminder-motion.gif` | 최종본 |
| `gentle` | `link-reminder-motion-gentle.gif` | 최종본 |
| `playful` | `link-reminder-motion-playful.gif` | 최종본 |

실제 이메일에서는 발송 전에 `normal`, `gentle`, `playful` 중 하나를 선택하고, 해당 에셋의 공개 HTTPS URL을 `{{motionGifUrl}}`에 넣습니다.

```ts
const motionFileByVariant = {
  normal: "link-reminder-motion.gif",
  gentle: "link-reminder-motion-gentle.gif",
  playful: "link-reminder-motion-playful.gif",
} as const;

type MotionVariant = keyof typeof motionFileByVariant;

function getMotionGifUrl(variant: MotionVariant, assetBaseUrl: string) {
  return `${assetBaseUrl}/${motionFileByVariant[variant]}`;
}
```

이메일 클라이언트 내부에서는 JavaScript 기반 선택 UI를 사용할 수 없으므로, 선택은 템플릿을 렌더링하기 전에 발송 코드에서 처리해야 합니다.

## 템플릿 값

| 값 | 설명 |
| --- | --- |
| `{{linkTitle}}` | 저장한 링크 제목 |
| `{{linkUrl}}` | 사용자가 열 실제 HTTPS URL |
| `{{motionGifUrl}}` | 선택한 모션 에셋의 공개 HTTPS URL |

정적 포스터는 `multipart/related` 첨부 파일로 넣고 `Content-ID`를 `link-reminder-poster`로 지정합니다. 템플릿은 이를 `cid:link-reminder-poster`로 참조합니다.

현재는 GIF의 공개 HTTPS URL이 없으므로 `{{motionGifUrl}}`에도
`cid:link-reminder-poster`를 넣어 정적 포스터를 표시합니다.

## 로컬 미리보기

저장소 루트를 `4174` 포트의 정적 파일 서버로 연 뒤 아래 주소에 접속하면, 화면 하단에서 세 모션을 전환할 수 있습니다.

```text
http://127.0.0.1:4174/email/link-reminder-email-preview.html
```

쿼리로 변형을 바로 지정할 수도 있습니다.

- 기본: `?motion=normal`
- gentle: `?motion=gentle`
- playful: `?motion=playful`

## TODO

- [ ] 실제 이메일에 사용하는 GIF 3개와 공용 포스터 PNG를 CDN, S3 같은 외부 오브젝트 스토리지에 배포하고 공개 HTTPS URL을 확보합니다.
- [ ] 발송 환경 설정에 에셋 기본 URL을 추가하고, 선택한 모션의 CDN URL을 `{{motionGifUrl}}`에 주입합니다.
- [ ] 공용 포스터를 현재처럼 CID 첨부로 유지할지 CDN URL로 전환할지 결정합니다. CDN으로 전환하면 HTML 배경 fallback과 Outlook VML 경로도 함께 변경해야 합니다.
- [ ] CDN 응답의 `Content-Type`, 캐시 정책, 외부 접근 가능 여부를 실제 이메일 클라이언트에서 확인합니다.

## 발송 시 주의사항

- 템플릿 치환 시 `{{linkTitle}}`은 HTML escape하고, `{{linkUrl}}`과 `{{motionGifUrl}}`에는 검증된 HTTPS URL만 허용해야 합니다.
- 애니메이션을 지원하지 않는 환경을 위해 CID 포스터 fallback을 구성했습니다. 실제 표시 방식은 이메일 클라이언트에 따라 다를 수 있습니다.
- Windows용 Outlook처럼 CSS 배경 GIF 지원이 제한적인 환경에서는 VML을 통해 정적 포스터를 사용합니다.
- 이메일 본문은 이미지와 독립된 실제 HTML이므로 이미지가 보이지 않아도 읽고 링크를 열 수 있습니다.
- Pretendard를 사용할 수 없는 이메일 클라이언트에서는 `sans-serif`로 fallback됩니다.
- 템플릿 폭은 최대 `600px`이며 작은 화면에서는 너비가 줄어듭니다.
