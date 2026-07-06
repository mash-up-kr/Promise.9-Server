# PR #34: [feature] 이미지 색상 추출 서비스 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/34
- Author: @vcz-Chan
- Base: main
- Head: feat/image-color
- Merged: 2026-07-06T14:23:15Z

## PR Body

## 📌 개요
이미지 URL에서 대표 색상 하나를 추출하는 `ImageColorService`를 추가했습니다.
서비스 로직에서는 `extractFromUrl()`만 사용하면 되고, 내부에서는 `sharp`와 `node-vibrant` 결과를 조합해 가장 적절한 색상을 선택합니다.

## ✅ 작업 내용 및 변경 사항
- [x] `sharp`, `node-vibrant` 의존성 추가
- [x] 색상 응답 타입과 선택 우선순위 상수 추가
- [x] `sharp` 기반 평균색/대표색 분석기 추가
- [x] `node-vibrant` 기반 팔레트 분석기 추가
- [x] `ImageColorService.extractFromUrl()` 추가
- [x] 색상 선택 우선순위와 fallback 테스트 추가

## 💬 리뷰어에게
외부 모듈에는 `ImageColorService`만 export하고, analyzer와 fetcher는 내부 provider로만 사용합니다.
실제 호출부에서 사용하는 API는 `extractFromUrl()` 하나로 보면 됩니다.
`extractAllFromUrl()`은 수동 preview에서 두 분석기 결과를 모두 보여주기 위한 preview 전용 함수입니다.

색상 선택 우선순위와 `node-vibrant` 실패 시 `sharp` 결과로 보정하는 정책을 중점적으로 봐주세요.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
서비스 로직에서는 아래처럼 이미지 URL만 넘겨 사용합니다.

```ts
const color = await imageColorService.extractFromUrl(imageUrl)
```

반환값은 최종 선택된 색상 하나입니다.

```ts
{
    source: 'node-vibrant.lightVibrant',
    hex: '#ffee66',
    rgb: [255, 238, 102],
    textColor: '#000',
    luminance: 0.82,
    isDark: false,
}
```

호출부에서 원하는 색상 타입이 있으면 `preferredColor` 옵션으로 지정할 수 있습니다.

```ts
const color = await imageColorService.extractFromUrl(imageUrl, {
    preferredColor: IMAGE_COLOR_SELECTION_SOURCE.SHARP_AVERAGE_COLOR,
})
```

다운로드 제한 옵션도 함께 넘길 수 있습니다.

```ts
const color = await imageColorService.extractFromUrl(imageUrl, {
    timeoutMs: 3000,
    maxBytes: 3 * 1024 * 1024,
    maxRedirects: 2,
})
```

색상 선택 흐름은 다음과 같습니다.

1. 이미지 URL을 다운로드합니다.
2. `sharp`로 평균색과 대표색을 계산합니다.
3. `node-vibrant`로 팔레트 색상을 계산합니다.
4. `preferredColor`가 있으면 해당 색상을 우선 사용합니다.
5. 없으면 밝고 선명한 색부터 정해진 우선순위대로 선택합니다.
6. 팔레트 결과가 부족하거나 실패하면 `sharp` 대표색으로 보정합니다.

기본 선택 우선순위는 다음과 같습니다.

1. `node-vibrant.lightVibrant`
2. `node-vibrant.vibrant`
3. `node-vibrant.muted`
4. `node-vibrant.darkVibrant`
5. `node-vibrant.darkMuted`
6. `node-vibrant.lightMuted`
7. `sharp.dominantColor`
8. `sharp.averageColor`
