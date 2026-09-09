# PR #130: [fix] Instagram 릴스 표지 캐시 키의 보조 ID 길이 제한 제거

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/130
- Author: @vcz-Chan
- Base: main
- Head: fix/instagram-reel-cache-key-length
- Merged: 2026-09-09T13:28:01Z

## PR Body

## 📌 개요

Instagram 릴스 표지의 캐시 키에 16자리 보조 ID가 포함되면, 기존 17자리 고정 조건 때문에 정상 이미지도 제외되는 문제를 수정합니다. 보조 ID 길이 제한만 제거하고 숫자 형식, CDN 도메인, 이미지 경로와 HTTPS 검증은 유지합니다.

## ✅ 작업 내용 및 변경 사항

- [x] 디코딩한 캐시 키가 숫자로 구성되고 대상 미디어 ID로 시작하면 표지 후보로 선택
- [x] 보조 ID가 없는 키, 다양한 길이의 숫자 보조 ID, 실제 16자리 사례 검증
- [x] 다른 미디어 ID, 문자 보조 ID, 허용하지 않은 CDN·경로·HTTP 후보 제외 검증

## 💬 리뷰어에게

캐시 키는 구분자 없이 미디어 ID와 보조 ID를 이어 붙인 관측 형식입니다. 길이를 고정하지 않으므로 같은 숫자 접두사를 가진 다른 미디어 ID와의 충돌을 완전히 구분하지는 못합니다. CDN 및 경로 선택 정책은 기존과 동일합니다.

## 🔗 관련 이슈

별도 이슈 없음.

## 🔍 상세 내용

- `DYRcEhypHUk`: 미디어 ID `3896018609115526436` + 16자리 보조 ID `2032281311028853`
- `DaU6WbhyRB7`: 미디어 ID `3933025002685272187` + 16자리 보조 ID `2107586660100624`
- `DdCkVSIyOdu`: 미디어 ID `3981904812807087982`만 포함해 기존 조건에서도 선택되는 사례

세 공개 릴스의 TinyFish 실제 응답을 수집해 최종 선택 로직으로 재검증했으며 모두 표지가 선택됩니다. 조사 시점 각 표지 URL의 HEAD 응답은 HTTP 200, image/jpeg였습니다.

검증: 최신 main 기준 Jest 54 suites / 463 tests 통과, TypeScript 빌드 타입 검사, 변경 파일 ESLint, git diff --check 통과.
