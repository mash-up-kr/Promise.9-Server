# API 명세서

> Base URL: `/api/v1`
>
> 인증: Bearer Token (JWT). 별도 표기가 없으면 `Authorization: Bearer {accessToken}`이 필요하다.
>
> 구현 상태는 [implementation-status.md](./implementation-status.md)에서 확인한다.

API 명세는 도메인별 문서로 관리한다.

| 도메인 | 문서                     | 주요 내용                                      |
| ------ | ------------------------ | ---------------------------------------------- |
| 공통   | [common.md](./common.md) | 공통 응답, 에러 응답, 링크 cursor 페이지네이션 |
| 인증   | [auth.md](./auth.md)     | 소셜 로그인, 토큰 재발급, 로그아웃, 회원 탈퇴  |
| 사용자 | [user.md](./user.md)     | 내 정보 조회                                   |
| 링크   | [link.md](./link.md)     | 링크 목록·저장·상세·수정·삭제·복구·조회 기록   |
| 태그   | [tag.md](./tag.md)       | 링크 태그 추가·삭제                            |
| 폴더   | [folder.md](./folder.md) | 링크 상태별 통계, 사용자 폴더 CRUD             |

화면에서 API를 어떻게 조합하는지는 [screen-mapping.md](./screen-mapping.md)를 참고한다.

## 공통 계약

- `GET /links`의 기본 페이지 크기는 `9`, 최대값은 `30`이며 cursor 페이지네이션을 사용한다.
- `GET /folders`는 페이지네이션하지 않는다. 기본적으로 전체 사용자 폴더를 반환하고, 선택적 `limit`은 결과 개수 제한에만 사용한다.
- `전체`, `미분류`, `즐겨찾기`, `최근 삭제`는 화면에서 폴더처럼 표시되지만 DB의 `folders` row가 아니다. `folderId` 없이 `GET /links` 필터 조합으로 조회하며, 최근 삭제는 삭제된 폴더가 아니라 soft delete된 링크 목록이다.
- 비동기 처리 중인 요약·태그·연관 링크는 `null`, 처리 완료 후 빈 목록은 `[]`로 반환한다.
