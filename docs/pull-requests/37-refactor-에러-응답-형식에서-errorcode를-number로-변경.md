# PR #37: refactor: 에러 응답 형식에서 errorCode를 number로 변경

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/37
- Author: @ninaxlee
- Base: main
- Head: refactor/exception-error-code
- Merged: 2026-07-13T12:19:06Z

## PR Body

## 📌 개요
<!-- 이 PR의 목적과 결과를 2~3문장으로 작성합니다. -->
에러 코드를 string -> number 형식으로 바꾸기로 하여 number형식으로 변경합니다.
포맷은 [도메인 2자리][종류 2자리][번호 아무거나] 입니다

## ✅ 작업 내용 및 변경 사항
<!-- 주요 작업 내용과 변경 사항을 체크리스트로 작성합니다. -->
- [x] 기본 exception과 filter에서의 형식 변경
- [x] 도메인별 exception의 코드 변경

## 💬 리뷰어에게
<!-- 중점적으로 봐줬으면 하는 부분이나 논의가 필요한 내용을 작성합니다. -->
에러 코드 저렇게 상수로 관리할까요? 파일명도 그렇고 좀 별로인 것 같아서 매직넘버로 쓰는건 어떨지.. 제안해봅니다
하다보니 좀 헷갈리는데 문서 관리가 잘 되어야 할 것 같아요

## 🔗 관련 이슈
close #

## 🔍 상세 내용
<!-- 변경 로직, 주요 흐름, 설계 의도, 다이어그램 등 공유가 필요한 내용을 작성합니다. -->
