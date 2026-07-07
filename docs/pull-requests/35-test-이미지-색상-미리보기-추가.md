# PR #35: [test] 이미지 색상 미리보기 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/35
- Author: @vcz-Chan
- Base: main
- Head: feat/image-color-preview
- Merged: 2026-07-06T14:23:41Z

## PR Body

## 📌 개요
이미지 색상 추출 결과를 눈으로 확인할 수 있는 수동 미리보기 스크립트를 추가했습니다.
지정한 이미지 URL을 분석하고, 이미지/색상/측정 정보를 HTML로 생성합니다.

## ✅ 작업 내용 및 변경 사항
- [x] `image-color:preview` 실행 스크립트 추가
- [x] 테스트 이미지 URL 기본값 추가
- [x] `sharp` 평균색/대표색 표시
- [x] `node-vibrant` 팔레트 6종 표시
- [x] 다운로드, 분석 시간, 메모리 사용량 표시
- [x] `.temp/image-color-preview.html` 생성

## 💬 리뷰어에게
이 PR은 자동 테스트가 아니라 사람이 결과를 확인하기 위한 수동 도구입니다.
운영 코드와 분리된 `test/manual` 아래에 두었고, 필요한 경우에만 `bun run image-color:preview`로 실행합니다.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
실행 흐름은 다음과 같습니다.

1. 이미지 URL을 인자로 받습니다.
2. 인자가 없으면 기본 테스트 이미지를 사용합니다.
3. `sharp`와 `node-vibrant`로 색상 분석 결과를 생성합니다.
4. 이미지, 추출 색상, 측정 정보를 HTML로 렌더링합니다.
5. 결과 파일을 `.temp/image-color-preview.html`에 저장합니다.

### 미리보기 예시
<img width="1686" height="3974" alt="_Users_leeseungchan_promise 9_Promise 9-Server_ temp_image-palette-preview html (2)" src="https://github.com/user-attachments/assets/49c88421-5bc5-4c5f-8f69-fc24b69ce52e" />
