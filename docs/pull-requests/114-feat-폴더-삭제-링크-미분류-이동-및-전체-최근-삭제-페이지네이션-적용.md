# PR #114: [feat] 폴더 삭제 링크 미분류 이동 및 전체, 최근 삭제 페이지네이션 적용

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/114
- Author: @Choi-JY1107
- Base: main
- Head: feature/folder-delete-link-pagination
- Merged: 2026-09-07T11:27:39Z

## PR Body

## 📌 개요

1. 폴더 삭제 시 포함된 링크까지 최근 삭제 상태가 되던 동작을 변경해, 링크는 유지하고 미분류로 이동하도록 수정했습니다.
2. 기존 링크 목록의 cursor 페이지네이션 구조를 전체 및 최근 삭제 목록에 연결하고, 최근 삭제 목록은 삭제 시각을 기본 정렬 기준으로 사용하도록 보완했습니다.

## ✅ 작업 내용 및 변경 사항

- [x] 폴더 삭제 시 해당 폴더의 링크를 미분류로 이동
    - 링크의 `deletedAt`은 변경하지 않고 `folderId`만 `null`로 변경
    - 링크 이동과 폴더 삭제를 하나의 transaction으로 처리
- [x] 전체 및 최근 삭제 링크 목록에 cursor 페이지네이션 적용
    - 전체 링크는 `savedAt DESC`, 최근 삭제 링크는 `deletedAt DESC`를 기본 정렬로 사용
    - 기존 `(정렬 시각, linkId)` 복합 cursor와 `limit + 1` 조회 구조 재사용
    - Query 기본값, cursor 생성 및 다음 페이지 여부에 대한 회귀 테스트 추가

## 💬 리뷰어에게

- 전체, 최근 삭제 목록 모두 기존 공통 cursor 생성 로직을 재사용하도록 구성한 부분이 현재 repository/service 책임 분리에 적절한지 의견 부탁드립니다.

## 🔗 관련 이슈

close #

## 🔍 상세 내용

### 폴더 삭제

`FolderRepository.removeAndUnassignLinks`에서 사용자 소유 폴더를 `FOR UPDATE`로 조회한 뒤, 해당 폴더의 활성 링크를 `folderId=null`로 갱신하고 폴더를 삭제합니다. 링크에는 `deletedAt`을 설정하지 않으므로 삭제 이후에도 미분류 활성 링크로 조회됩니다.

### 링크 목록 페이지네이션

별도 Endpoint를 추가하지 않고 기존 `GET /links`의 cursor 페이지네이션을 사용합니다.

| 목록           | 요청                      | 기본 정렬   |
| -------------- | ------------------------- | ----------- |
| 전체 링크      | `GET /links`              | `savedAt`   |
| 최근 삭제 링크 | `GET /links?deleted=true` | `deletedAt` |

첫 페이지는 `cursor` 없이 요청하고, 다음 페이지부터 응답의 `nextCursor`를 전달합니다. 동일한 정렬 시각을 가진 링크가 누락되지 않도록 링크 ID를 보조 정렬 키로 사용하며, `totalCount`는 cursor와 무관한 전체 필터 결과 수를 유지합니다.
