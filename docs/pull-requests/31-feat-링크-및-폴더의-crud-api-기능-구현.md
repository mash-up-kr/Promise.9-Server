# PR #31: [feat] 링크 및 폴더의 CRUD API 기능 구현

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/31
- Author: @Choi-JY1107
- Base: main
- Head: feature/link-crud
- Merged: 2026-07-01T14:01:15Z

## PR Body

## 📌 작업 내용
| 무엇을, 왜 변경했는지

링크,폴더 CRUD API를 구현했습니다. 


<br>

## ✅ 변경 사항

- [x] 폴더 CRUD: 생성 / 목록(시스템 폴더 카운트 포함) / 이름 변경 / 삭제 / 폴더 내 링크 조회
- [x] 링크 CRUD: 저장 / 상세 / 수정(폴더 이동·메모) / 삭제 / 복구 / 검색
- [x] 소프트 delete 도입: 삭제 시 `deletedAt`으로 "최근 삭제된 항목"으로 이동, 복구 시 미분류로 복원
- [x] 시스템 폴더(전체/미분류/최근삭제)는 row가 아닌 카운트 계산값으로 처리
- [x] Drizzle 스키마(`folders`, `links`) 및 초기 마이그레이션 추가
- [x] Zod 기반 요청 검증 파이프(`ZodValidationPipe`) + 공통 검증 예외 추가


<br>

## 📷 스크린샷 (선택)

<img width="1178" height="791" alt="image" src="https://github.com/user-attachments/assets/f1c648d8-a58d-4b19-8e08-a00fd985b6d6" />

<br>

## 🔗 관련 이슈
| close #이슈번호

<br>

## 💬 리뷰어에게
| 중점적으로 봐줬으면 하는 부분

1. 디자인 패턴 괜찮은 지 봐주세요.
2. drizzle 마이그레이션 파일명 괜찮을까요.
3. api route 될 때, 명사는 단수? vs 복수?
