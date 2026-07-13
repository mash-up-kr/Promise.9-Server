# API 구현 현황

API 명세, Swagger, controller endpoint, 실제 비즈니스 로직의 진행 상태를 분리해서 관리한다.

| 기호 | 의미                                            |
| ---- | ----------------------------------------------- |
| O    | 현재 계약대로 동작함                            |
| △    | 껍데기 또는 일부 로직만 있으며 TODO가 남아 있음 |
| X    | 아직 없음                                       |

## 인증

| API                 | 명세 | Swagger | Endpoint | 로직 | 남은 작업                        |
| ------------------- | :--: | :-----: | :------: | :--: | -------------------------------- |
| `POST /auth/social` |  O   |    O    |    O     |  △   | Google 동작, Kakao provider TODO |

## 링크

| API                                   | 명세 | Swagger | Endpoint | 로직 | 남은 작업                                                     |
| ------------------------------------- | :--: | :-----: | :------: | :--: | ------------------------------------------------------------- |
| `GET /links`                          |  O   |    O    |    O     |  △   | 즐겨찾기, 대표 태그, 최근 조회 정렬, cursor 페이지네이션 연결 |
| `GET /links/preview`                  |  O   |    X    |    X     |  X   | URL 메타데이터 미리보기 구현                                  |
| `POST /links`                         |  O   |    O    |    O     |  △   | 메타데이터·요약·태그 비동기 작업 연결                         |
| `GET /links/{linkId}`                 |  O   |    O    |    O     |  △   | 발행일·태그·연관 링크 실제 값 연결                            |
| `PATCH /links/{linkId}`               |  O   |    O    |    O     |  O   | -                                                             |
| `DELETE /links/{linkId}`              |  O   |    O    |    O     |  O   | -                                                             |
| `POST /links/{linkId}/restore`        |  O   |    O    |    O     |  O   | -                                                             |
| `POST /links/{linkId}/view`           |  O   |    O    |    O     |  O   | -                                                             |
| `POST /links/{linkId}/tags`           |  O   |    O    |    O     |  △   | 현재 501, 소유권·정규화·중복 검사·DB 저장 TODO                |
| `DELETE /links/{linkId}/tags/{tagId}` |  O   |    O    |    O     |  △   | 현재 501, 링크·태그 소유권 확인·DB 삭제 TODO                  |

제거한 API:

- `GET /links/search` → `GET /links?q={keyword}`로 통합
- `GET /folders/{folderId}/links` → `GET /links?folderId={folderId}`로 통합

## 폴더

| API                          | 명세 | Swagger | Endpoint | 로직 | 남은 작업                                 |
| ---------------------------- | :--: | :-----: | :------: | :--: | ----------------------------------------- |
| `GET /folders`               |  O   |    O    |    O     |  △   | 즐겨찾기 카운트, `lastSavedAt`, 정렬 연결 |
| `POST /folders`              |  O   |    O    |    O     |  O   | -                                         |
| `PATCH /folders/{folderId}`  |  O   |    O    |    O     |  O   | -                                         |
| `DELETE /folders/{folderId}` |  O   |    O    |    O     |  O   | -                                         |

## 화면 단위 후속 작업

| 화면 기능                    | 상태 | 남은 작업                                      |
| ---------------------------- | :--: | ---------------------------------------------- |
| 홈 최근 저장 링크            |  △   | `GET /links` 정렬·limit 실제 적용              |
| 홈 최근 저장 폴더            |  △   | `lastSavedAt` 집계 및 정렬 연결                |
| 보관함 링크 상태·사용자 폴더 |  △   | 즐겨찾기 카운트와 폴더 정렬 연결               |
| 링크 상세                    |  △   | 발행일·태그·연관 링크 실제 값 연결             |
| 검색 결과                    |  △   | `GET /links?q=...` 계약 완료, cursor 연결 필요 |
| 검색 기본 화면 최근 본 링크  |  △   | `viewedAt` 기준 정렬·페이지네이션 연결 필요    |
| 카테고리 둘러보기            |  X   | 카테고리 데이터 정책과 API 결정 필요           |
| 최근 검색어                  |  X   | 로컬 또는 서버 저장 정책 결정 필요             |
