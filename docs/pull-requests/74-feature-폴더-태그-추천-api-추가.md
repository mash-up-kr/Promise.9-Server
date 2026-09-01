# PR #74: [feature] 폴더·태그 추천 API 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/74
- Author: @vcz-Chan
- Base: main
- Head: feature/folder-tag-recommendations
- Merged: 2026-08-25T15:47:40Z

## PR Body

## 📌 개요

홈 화면의 `자주 저장한 키워드` 섹션에서 사용할 폴더·태그 추천 API를 추가합니다.
유형별 정규화나 임의 가중치 없이 실제 활성 링크 수를 직접 비교하고, 동점일 때만 최근 조회 시각을 사용합니다.

![홈 화면의 자주 저장한 키워드 섹션](https://github.com/mash-up-kr/Promise.9-Server/blob/b7d7534ccca8beafd197ca5a31069b0ed97c81b6/docs/api/screens/home-frequent-keywords.png?raw=true)

## ✅ 작업 내용 및 변경 사항

- [x] 인증이 적용된 `GET /api/v1/recommendations` 추가
- [x] 활성 폴더·태그별 링크 수와 마지막 조회 시각 집계
- [x] 활성 링크가 3개 이상 연결된 폴더·태그만 추천 후보로 제한
- [x] 폴더와 태그를 동일한 응답 목록으로 결합
- [x] `링크 수 DESC → lastViewedAt DESC → type, key ASC` 안정 정렬
- [x] `limit` 기본값 12, 최대 50 검증
- [x] 후보가 3개 이하면 추천 영역을 숨길 수 있도록 `data: null` 반환
- [x] nullable 응답, 필드 설명과 폴더·태그 예시를 포함한 Swagger 추가
- [x] OpenAPI 3.0에서 DTO 또는 `null`을 명시적으로 허용하는 `oneOf` 응답 schema와 Swagger tag 문서 링크 추가
- [x] 홈 화면 `자주 저장한 키워드` 섹션과 API 호출·노출 조건 문서화
- [x] 화면 참고 이미지 추가
- [x] `recommendation/` 루트에 controller·service·repository·Swagger를 평탄하게 배치
- [x] repository, service, 정렬, query validation 테스트 추가

## 💬 리뷰어에게

폴더와 태그를 유형별로 따로 정규화하지 않고 `linkCount` 원값으로 같은 목록에서 비교합니다.
사용자 범위와 soft delete 제외 조건, 그리고 링크 수 동점에서만 최근 조회 시각이 적용되는지 확인해 주세요.
개별 폴더·태그는 활성 링크가 3개 이상일 때만 후보가 됩니다. 후보 3개 이하 판정은 이 필터를 통과한 전체 후보를 대상으로 `limit` 적용 전에 수행하며, Swagger의 성공 응답 `data`도 실제 계약과 같이 nullable로 선언했습니다.
클라이언트는 `data: null`일 때 빈 상태를 표시하지 않고 섹션 제목과 키워드 칩을 포함한 영역 전체를 렌더링하지 않습니다.

## 🔗 관련 이슈

없음

## 🔍 상세 내용

### 집계 대상

- 폴더: 삭제되지 않은 폴더에 속한 활성 링크
- 태그: 활성 링크에 연결된 태그를 `normalizedName` 기준으로 그룹화
- 링크 수: 각 폴더 또는 태그에 연결된 활성 링크 수
- 최근 조회: 각 그룹에서 가장 최근의 `links.viewedAt`
- 최소 후보 기준: 그룹별 활성 링크 수 3개 이상

폴더와 태그 집계는 서로 독립적인 쿼리로 병렬 실행합니다.

### 정렬 계약

이 추천은 별도의 점수나 임의 가중치를 계산하지 않습니다. 폴더와 태그를 같은 후보 배열에 넣고 아래 비교자를 그대로 적용합니다.

```text
linkCount DESC
→ lastViewedAt DESC (null last)
→ type ASC
→ key ASC
```

1. `linkCount`: 해당 폴더 또는 태그에 연결된 활성 링크 수가 많은 항목을 먼저 둡니다.
2. `lastViewedAt`: 링크 수가 같을 때만, 해당 그룹 링크 중 가장 최근에 조회한 시각을 비교합니다. 조회 이력이 없는 `null`은 뒤로 보냅니다.
3. `type`, `key`: 앞의 두 값까지 같을 때 결과 순서를 항상 같게 만드는 안정 정렬 키입니다.
4. 활성 링크가 1~2개인 폴더·태그는 DB 집계의 `HAVING count >= 3`에서 제외합니다.
5. 링크 수 필터를 통과한 전체 후보가 3개 이하면 정렬하지 않고 `data: null`을 반환합니다.
6. 후보가 4개 이상이면 전체 후보를 정렬한 후 `limit`을 적용합니다. 기본값은 12, 최대값은 50입니다.

예를 들어 링크가 12개인 폴더는 최근 조회가 없더라도 링크가 9개인 태그보다 먼저 나옵니다. 두 항목의 링크 수가 모두 12개일 때만 `lastViewedAt`이 더 최근인 항목이 앞섭니다.

임의 점수, 최근성 감쇠, 폴더·태그 유형별 정규화는 사용하지 않습니다. 따라서 응답에도 내부 `score` 필드가 없습니다.

### API 계약

```http
GET /api/v1/recommendations?limit=12
Authorization: Bearer <access-token>
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "key": "folder:3",
        "type": "folder",
        "label": "디자인",
        "linkCount": 12,
        "lastViewedAt": "2026-08-08T00:00:00.000Z",
        "folderId": 3,
        "color": "#61a8ef"
      },
      {
        "key": "tag:product-design",
        "type": "tag",
        "label": "Product Design",
        "linkCount": 9,
        "lastViewedAt": null,
        "normalizedTag": "product-design"
      },
      {
        "key": "folder:8",
        "type": "folder",
        "label": "개발",
        "linkCount": 7,
        "lastViewedAt": "2026-08-05T00:00:00.000Z",
        "folderId": 8,
        "color": "#7f6df2"
      },
      {
        "key": "tag:travel",
        "type": "tag",
        "label": "여행",
        "linkCount": 5,
        "lastViewedAt": null,
        "normalizedTag": "travel"
      }
    ]
  }
}
```

- 폴더와 태그가 `items` 한 배열에 섞여 반환됩니다.
- 활성 링크가 3개 이상 연결된 폴더·태그만 후보가 됩니다.
- 링크 수 필터를 통과한 후보를 합쳐 3개 이하면 `{ "success": true, "data": null }`을 반환합니다.
- 후보가 4개 이상이면 정렬 후 최대 `limit`개를 반환하며, `limit`을 생략하면 최대 12개입니다.
- 폴더 항목에는 `folderId`, `color`가 포함됩니다.
- 태그 항목에는 `normalizedTag`가 포함됩니다.
- 태그는 `normalizedName`이 같은 항목을 하나로 집계하며, 표기명이 여러 개면 사전순으로 가장 앞선 값을 `label`로 사용합니다.
- 점수나 가중치는 응답과 요청에 존재하지 않습니다.

### 인증·검증·DB 영향

- `JwtAuthGuard`와 `CurrentUser`를 사용해 사용자 범위를 고정합니다.
- Zod strict query schema로 `limit` 외 파라미터를 거부합니다.
- Swagger는 OpenAPI 3.0 `oneOf`로 `data: RecommendationResponseDto | null`을 표현하고 공통 `{ success, data }` envelope, query 범위, 필드별 설명과 폴더·태그 예시를 제공합니다.
- validation `400`과 invalid token `401`은 기존 공통 오류 응답 형식으로 문서화합니다.
- 기존 `folders`, `links`, `tags`를 집계하므로 마이그레이션은 없습니다.

### 검증

- targeted Jest: 5 suites / 8 tests
- `bun run build`
- 변경 파일 ESLint
