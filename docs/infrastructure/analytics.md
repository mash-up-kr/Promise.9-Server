# 분석 인프라

`Promise9AnalyticsStack`은 서울 리전의 운영용 이벤트 수집·분석 리소스를 정의한다. 현재는 운영용 CDK 구현 및 로컬 검증 상태이며 배포하지 않았다. 서버 이벤트 전송, 계정 UTM API, 비즈니스 이벤트 발행과 Grafana 연결은 후속 작업이다.

## 구성

| 리소스 | 설정 |
| --- | --- |
| Cognito Identity Pool | 게스트 접근, enhanced flow. 별도 User Pool 없음 |
| 게스트 IAM 역할 | 해당 Identity Pool로 trust 제한, 해당 Firehose의 `PutRecordBatch`만 허용 |
| Firehose | `promise9-analytics-production`, DirectPut, AWS 소유 키 암호화 |
| 변환 | OpenX JSON → Snappy Parquet, Glue `LATEST` 스키마, 64MiB / 300초 버퍼 힌트 |
| 분석 S3 | `events/`와 `errors/`, SSE-S3·HTTPS·공개 차단 |
| 결과 S3 | `query-results/`, SSE-S3·HTTPS·공개 차단 |
| Glue | `promise9_analytics_production.events`, 날짜 projection |
| Athena | `promise9-analytics-production`, engine v3, 쿼리당 1GiB 제한, 결과 경로·암호화 강제 |
| CloudWatch | Firehose 전달 진단 로그 30일 보존 |

정상 이벤트 `events/`는 자동 삭제 없이 보관한다. 오류 `errors/`와 Athena 결과 `query-results/`는 생성 후 7일이 지나면 S3 lifecycle 만료 대상으로 처리한다. 실제 삭제는 비동기로 진행된다. 쿼리 결과가 만료되어도 이벤트를 다시 조회해 과거 지표를 계산할 수 있다. 두 버킷과 Glue 메타데이터·Athena Workgroup은 스택 삭제·교체 시 보존한다. `terminationProtection`도 활성화한다. 데이터가 계속 누적되므로 기존 설계 비용표의 90일 보관 가정과 실제 저장량을 구분한다.

기존 `Promise9AppRuntime` 사용자는 QueueStack 소유로 유지한다. AnalyticsStack이 고유한 이름의 inline policy로 운영 Firehose의 `PutRecordBatch` 권한만 추가한다. 기존 SQS·SES 정책과 IAM User는 변경하지 않는다. 최초 생성 순서를 위해 AnalyticsStack이 QueueStack에 의존한다.

Kinesis·수집 API·SQS·Crawler·ETL Job·변환 Lambda·동적 파티셔닝은 추가하지 않는다. Grafana에 부여할 조회 자격 증명과 권한은 인증 방식 결정 후 별도로 구성한다.

## producer 전송 계약

`PutRecordBatch`의 각 Record.Data에 이벤트 하나를 UTF-8 JSON으로 넣는다. AWS SDK의 바이트 전송을 사용하며 임의로 이중 base64 인코딩하지 않는다.

- 공통 필드는 [이벤트 설계](./analytics-event-design.md)의 계약을 따른다.
- `schema_version`은 정수, 사용자·이벤트 ID는 문자열이다.
- `occurred_at`, `attribution.captured_at`은 ISO 8601 UTC 문자열이다.
- `attribution`은 고정 구조의 객체 또는 `null`이다.
- 훅의 `properties` 객체는 전송 전에 **`properties_json` 문자열로 직렬화**한다. `properties` 객체를 그대로 보내면 현재 Glue 스키마에 포함되지 않는다.
- `received_at`은 현재 스키마에 없다. `arrival_date`는 경로에서 제공되는 파티션이며 producer가 보낼 필요가 없다.
- 필드를 추가하면 Glue 스키마와 producer 버전 호환성을 함께 검토한다. `LATEST`를 사용하므로 스키마 수정은 이후 변환에도 적용된다.

## 조회와 파티션

정상 파일은 `events/arrival_date=YYYY-MM-DD/`, 변환 실패는 `errors/type=.../arrival_date=YYYY-MM-DD/`에 저장한다. Firehose timestamp는 파일 안에서 가장 오래된 레코드의 대략적인 도착 시각이며 UTC다. 개별 이벤트의 발생 날짜와 다를 수 있다.

Projection 범위는 설계 시작일인 `2026-10-14`부터 `NOW`까지다. 새 날짜에 대해 Crawler나 `MSCK REPAIR TABLE`을 실행할 필요가 없다. 과거 데이터를 backfill하면서 이보다 이전 경로를 만들 경우 projection 범위도 수정해야 한다.

배포 후 사용할 조회 예시:

```sql
SELECT
    source,
    event_name,
    count(DISTINCT event_id) AS event_count
FROM promise9_analytics_production.events
WHERE arrival_date BETWEEN '2026-10-14' AND '2026-10-15'
GROUP BY source, event_name;
```

발생 시각 기반 지표에서는 별도로 `from_iso8601_timestamp(occurred_at)`을 필터링한다. 도착 지연을 감안해 파티션 범위를 충분히 잡는다. 큐의 재시도로 같은 이벤트가 여러 번 적재될 수 있으므로 일반 분석 뷰에서도 `event_id` 중복 제거가 필요하다.

## 로컬 검증

레포 루트에서 실행한다. 배포 명령은 포함하지 않는다.

```bash
bun run infra:typecheck
bun run --cwd infra test
bun run infra:synth --profile promise9 --quiet --no-notices
```

CI는 AWS 자격 증명 없이 타입 검사·테스트·합성을 실행한다. 로컬 기본 AWS 프로필이 다른 계정이면 기존 계정 검사로 중단되므로 `promise9` 프로필을 명시한다.

검증 범위는 Cognito trust·쓰기 권한, 기존 사용자 재생성 방지, S3 정상 이벤트 만료 없음·오류/결과 7일 만료·RETAIN·암호화·HTTPS, DirectPut·Parquet 변환 구성, IAM 적용 순서, projection·Athena 결과 강제 설정이다. 합성은 실제 Cognito 자격 증명 발급·Firehose 변환·S3 적재·Athena 실행 성공을 보장하지 않는다. 해당 통합 검증은 배포 승인 후 진행한다.

## 배포 전 검토와 출력

배포 전에는 기존 팀 CDK 변경 절차에 따라 실제 diff를 검토한다. 새 리소스 생성과 기존 서버 사용자의 Firehose 쓰기 권한 추가가 예상 변경이다. 배포는 별도 승인이 필요하며 아직 실행하지 않았다.

Outputs는 `IdentityPoolId`, `Region`, `DeliveryStreamName`, `DeliveryStreamArn`, `DataBucketName`, `QueryResultsBucketName`, `DatabaseName`, `TableName`, `WorkgroupName`이다. 실제 리소스 값은 배포 후 확인한다. 자격 증명이나 Secret Access Key를 출력하지 않는다.
