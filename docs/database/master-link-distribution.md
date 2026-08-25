# 마스터 링크 배포

## 목적

UT 전에 주제별 링크를 마스터 계정에서 한 번 분석한 뒤, 같은 폴더와 분석 결과를
대상 유저 계정으로 복제한다. 대상 유저별로 링크 수집·AI 요약·태그 생성·임베딩을
다시 실행하지 않는 것이 목적이다.

이 기능은 HTTP API가 아니라 관리자용 DB 스크립트다. 운영 환경에서는 SSH 터널과
관리자 DB 계정이 필요하다.

## 사용 시나리오

1. 마스터 계정에 UT 주제용 실제 폴더를 만든다.
2. 폴더에 링크를 저장하고 모든 링크의 분석과 임베딩 완료를 기다린다.
3. 배포 스크립트를 dry-run으로 실행해 대상과 건수를 확인한다.
4. 같은 명령에 반영 옵션을 추가해 대상 유저에게 배포한다.
5. dry-run을 다시 실행해 새로 넣을 링크가 0개인지 확인한다.

`미분류`, `전체`, `즐겨찾기`, `최근 삭제`는 실제 `folders` row가 아니므로 배포
원본으로 선택할 수 없다. UT 묶음은 반드시 마스터 계정의 실제 폴더로 준비한다.

## 데이터 처리 정책

### 폴더

- 대상 유저에게 같은 이름의 활성 폴더가 있으면 재사용한다.
- 동명 폴더가 없으면 원본의 이름·색상·정렬 순서로 새 폴더를 만든다.
- 기존 동명 폴더의 색상과 정렬 순서는 변경하지 않는다.
- 새 폴더가 필요한데 대상 유저의 활성 폴더가 30개이면 중단한다.

### 링크

| 구분            | 필드                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| 복사            | `originalUrl`, `normalizedUrl`, `finalUrl`, `domain`, `title`, `metadata` |
| 복사            | `aiSummary`, `aiSummaryStatus`, `embedding`                               |
| 새 값           | `id`, `userId`, `folderId`, `createdAt`, `updatedAt`                      |
| 기본값으로 시작 | `memo`, `reminderAt`, `isFavorite`, `viewedAt`, `deletedAt`               |
| 복사하지 않음   | `ai_metrics`, `ai_summary_metrics` 등 과거 AI 실행 이력                   |

새 링크는 대상 유저 소유의 별도 `links` row다. 원본 `links.id`를 공유하지 않으며,
복제 시 새 identity ID를 발급한다.

### 태그

- 링크에 연결된 `user`, `rule`, `ai` 태그를 모두 복사한다.
- 새 `tags.id`와 대상 유저의 `userId`, 새 링크의 `linkId`를 사용한다.
- 태그 이름·정규화 이름·출처·정렬 순서는 유지한다.

### 중복 URL

- 대상 유저에게 같은 `normalizedUrl`의 활성 링크가 있으면 건너뛴다.
- 기존 링크를 새 폴더로 이동하거나 내용을 덮어쓰지 않는다.
- 기존 링크에 원본 태그를 병합하지 않는다.
- soft delete된 링크만 있으면 새 활성 링크를 삽입할 수 있다.

따라서 대상 유저가 이미 일부 URL을 저장했다면 배포된 폴더가 마스터 폴더와 완전히
같지 않을 수 있다. dry-run의 `중복으로 건너뛸 링크` 수를 반드시 확인한다.

## 안전장치

- 기본 실행은 DB를 변경하지 않는 dry-run이다.
- 실제 반영에는 `--apply`가 필요하다.
- 운영 반영에는 `--apply --force-production`이 모두 필요하다.
- 원본 링크 중 `aiSummaryStatus !== SUCCESS`이거나 `embedding IS NULL`인 링크가
  하나라도 있으면 전체 작업을 중단한다.
- 폴더 생성, 링크 삽입, 태그 삽입은 하나의 DB 트랜잭션으로 처리한다.
- 삽입 도중 실패하면 해당 배포 작업 전체를 rollback한다.
- 대상 유저 row를 잠가 같은 유저에 대한 동시 배포를 직렬화한다.
- 활성 URL unique index와 `ON CONFLICT DO NOTHING`으로 재실행을 멱등하게 처리한다.

트랜잭션이 commit된 뒤에는 자동 되돌리기 명령을 제공하지 않는다. 대규모 배포 전에는
운영 DB 백업을 만들고, 삭제가 필요하면 삽입된 대상과 범위를 다시 검토한 별도 작업으로
진행한다.

## 사전 조건

- `.env`에 대상 환경의 DB URL과 `MASTER_USER_ID`가 설정되어 있어야 한다.
- 대상 유저가 `users`에 활성 상태로 존재해야 한다.
- 운영 DB는 [Database Operations](./operations.md)의 SSH 터널을 통해 접속한다.
- 마스터 폴더의 모든 활성 링크가 분석·임베딩 완료 상태여야 한다.
- 운영 작업 전 `aws login --profile promise9` 로그인이 유효해야 한다.

## 폴더 배포 명령

폴더와 대상 유저는 각각 ID 또는 이름/이메일 중 한 방식으로 지정한다.

```bash
# 터미널 1: 운영 DB 터널
bun run db:tunnel

# 터미널 2: 폴더명과 대상 이메일로 dry-run
bun run db:distribute:master-folder -- \
  --env=production \
  --folder-name="2차 UT 개발 아티클" \
  --target-user-email="user@example.com"
```

ID를 알고 있다면 다음처럼 실행할 수 있다.

```bash
bun run db:distribute:master-folder -- \
  --env=production \
  --folder-id=42 \
  --target-user-id=17
```

dry-run에서 환경, 마스터/대상 유저 ID, 폴더, 링크·태그 수, 중복 수와 분석 미완료
수가 모두 의도와 맞는지 확인한다. 실제 반영은 같은 명령에 옵션을 추가한다.

```bash
bun run db:distribute:master-folder -- \
  --env=production \
  --folder-name="2차 UT 개발 아티클" \
  --target-user-email="user@example.com" \
  --apply \
  --force-production
```

반영 후 처음 실행한 dry-run을 다시 실행한다. 정상적으로 모두 반영됐다면
`새로 넣을 링크: 0`이 출력된다.

## 개발 마스터 데이터를 운영 마스터로 동기화

`db:sync:master-links`는 유저 배포와 다른 운영 보조 명령이다. 개발 DB 마스터의
모든 활성 실제 폴더와 미분류 링크를 운영 DB 마스터로 복제한다.

- 개발 마스터는 `MASTER_USER_ID`로 찾는다.
- 운영 마스터는 개발 마스터와 같은 이메일의 활성 유저로 찾는다.
- 운영의 활성 중복 URL은 덮어쓰지 않는다.
- 모든 폴더와 링크를 하나의 운영 DB 트랜잭션으로 반영한다.

```bash
# dry-run
bun run db:sync:master-links

# 실제 운영 반영
bun run db:sync:master-links -- --apply --force-production
```

이 명령은 개발 마스터의 미분류 링크까지 전부 대상으로 삼는다. 일부 UT 폴더만 유저에게
배포할 때는 사용하지 않고 `db:distribute:master-folder`를 사용한다.

## 재실행과 실패 처리

| 상황                             | 동작                                            |
| -------------------------------- | ----------------------------------------------- |
| 같은 명령을 다시 실행            | 기존 활성 URL은 건너뛰고 누락된 링크만 추가     |
| 대상에 동명 폴더가 이미 있음     | 해당 폴더 재사용                                |
| 원본에 분석 미완료 링크가 있음   | DB 변경 전에 중단                               |
| 대상 유저가 없음                 | DB 변경 전에 중단                               |
| 대상 유저의 활성 폴더가 30개     | 새 폴더가 필요하면 중단                         |
| 링크 또는 태그 삽입 중 오류 발생 | 해당 실행에서 만든 폴더·링크·태그 전체 rollback |
| 운영 옵션이 부족함               | `--apply --force-production` 안내 후 중단       |

## 현재 제한사항

- 한 번에 대상 유저 한 명에게만 배포한다.
- 여러 유저 배포 이력을 저장하는 별도 테이블은 없다.
- 중복 링크를 새 폴더로 이동하거나 태그를 병합하지 않는다.
- 마스터 폴더가 수정된 이후 어떤 버전을 배포했는지 기록하지 않는다.

반복적인 다수 유저 배포와 배포 이력 조회가 필요해지면 `link_batches`와
`link_batch_deliveries` 같은 별도 모델을 도입할지 다시 결정한다.

## 문제 해결

### 운영 DB에 연결되지 않음

```text
connect ECONNREFUSED 127.0.0.1:15432
```

`bun run db:tunnel`이 실행 중인지 확인한다. AWS 세션이 만료됐다면
`aws login --profile promise9`으로 다시 로그인한다.

### 분석 미완료 링크가 있음

마스터 계정에서 해당 폴더의 링크 처리가 끝났는지 확인한다. 이 스크립트는 AI 또는
임베딩을 재실행하지 않으므로, 원본 분석을 완료한 뒤 dry-run을 다시 실행한다.

### 중복 링크 때문에 폴더 링크 수가 다름

대상 유저의 기존 활성 링크를 자동으로 이동하지 않는 현재 정책에 따른 결과다. 기존
링크를 새 폴더로 이동할지는 유저 데이터 변경 정책을 확인한 뒤 별도로 처리한다.
