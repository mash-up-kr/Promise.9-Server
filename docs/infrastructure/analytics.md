# 분석 인프라

`Promise9AnalyticsStack`은 서울 리전의 운영용 Cognito·Firehose·S3·Glue·Athena 리소스를 정의한다. 클라이언트와 서버가 공용 Firehose에 직접 배치 전송하며, S3의 Parquet을 Athena로 조회한다. 공통 데이터 계약은 [비즈니스 이벤트 수집](./analytics-event-design.md)을 참고한다.

## 구성과 보존

| 리소스 | 설정 |
| --- | --- |
| Cognito Identity Pool | 게스트 접근, enhanced flow |
| 게스트 IAM 역할 | 해당 Identity Pool의 비로그인 자격 증명으로 대상 Firehose의 `PutRecordBatch`만 허용 |
| Firehose | `promise9-analytics-production`, DirectPut, AWS 소유 키 암호화 |
| 변환 | OpenX JSON → Snappy Parquet, Glue `LATEST` 스키마 |
| S3 전달 버퍼 | 64MiB / 300초. 먼저 충족한 조건을 기준으로 전달하는 버퍼 힌트 |
| 분석 S3 | `events/`와 `errors/`, SSE-S3·HTTPS·공개 차단 |
| 결과 S3 | `query-results/`, SSE-S3·HTTPS·공개 차단 |
| Glue | `promise9_analytics_production.events`, 날짜 partition projection |
| Athena | `promise9-analytics-production`, engine v3, 쿼리당 1GiB 스캔 제한, 결과 경로·암호화 강제 |
| CloudWatch | Firehose 전달 진단 로그 30일 보존 |

정상 이벤트는 자동 삭제 없이 보관한다. 오류와 Athena 쿼리 결과는 생성 후 7일이 지나면 S3 lifecycle 만료 대상이 된다. 과거 지표는 정상 이벤트를 다시 조회해 계산한다. 버킷·Glue 메타데이터·Athena Workgroup은 스택 삭제·교체 시 보존하며 스택에 `terminationProtection`을 적용한다.

## 접근 권한과 전송

클라이언트는 Identity Pool ID·리전·스트림 이름으로 Cognito 임시 자격 증명을 발급받는다. 서버는 기존 `Promise9AppRuntime` IAM 사용자를 이용한다. AnalyticsStack은 해당 사용자에 Firehose 쓰기 정책을 추가하며, 사용자 소유 스택인 QueueStack에 의존한다.

`PutRecordBatch`의 각 `Record.Data`에 이벤트 하나를 UTF-8 JSON 바이트로 넣는다. `properties` 객체는 전송 전에 `properties_json` 문자열로 직렬화한다. 필드 추가 시 producer와 Glue 스키마를 함께 변경한다.

실패한 레코드만 같은 ID로 재시도하고 조회 시 `event_id`로 중복 제거한다. Firehose 수락 이후 변환 오류는 `errors/`에서 확인한다. DirectPut의 S3 전달 실패는 최대 24시간 보관·재시도한다. [AWS 전달 실패 처리](https://docs.aws.amazon.com/firehose/latest/dev/retry.html)

## S3 경로와 조회

```text
분석 버킷: events/arrival_date=YYYY-MM-DD/*.parquet
           errors/type=.../arrival_date=YYYY-MM-DD/...
결과 버킷: query-results/...
```

`arrival_date`는 파일 내 가장 오래된 레코드의 대략적인 Firehose 도착 시각(UTC)을 기준으로 한다. Projection 범위는 `2026-10-14`부터 `NOW`까지이며 별도 파티션 등록 작업은 없다.

```sql
SELECT source, event_name, count(DISTINCT event_id) AS event_count
FROM promise9_analytics_production.events
WHERE arrival_date BETWEEN '2026-10-14' AND '2026-10-15'
GROUP BY source, event_name;
```

발생 시각 기준 지표에는 `from_iso8601_timestamp(occurred_at)` 조건을 추가한다. 도착 지연을 감안해 파티션 범위를 잡고, projection 시작일 이전 경로로 backfill할 때는 범위도 변경한다. Grafana 조회용 자격 증명과 권한은 별도로 구성해야 한다.

## 설정값과 검증

CDK Outputs:

- 전송: `IdentityPoolId`, `Region`, `DeliveryStreamName`, `DeliveryStreamArn`
- 저장: `DataBucketName`, `QueryResultsBucketName`
- 조회: `DatabaseName`, `TableName`, `WorkgroupName`

레포 루트에서 타입 검사·테스트·합성을 실행한다.

```bash
bun run infra:typecheck
bun run --cwd infra test
bun run infra:synth --profile promise9 --quiet --no-notices
```

CI는 AWS 자격 증명 없이 합성한다. 로컬에서는 대상 계정의 `promise9` 프로필을 사용한다. 배포 후 Cognito 발급 → Firehose 전송 → S3 변환 결과 → Athena 조회를 확인한다. CDK 운영 절차는 [인프라 문서](./README.md)를 따른다.

## 비용

서울 리전 공개 단가, 2026-10-14 확인 기준. USD이며 세금·환율·계정 크레딧은 제외한다.

| 항목 | 단가·계산 기준 |
| --- | --- |
| [Cognito Identity Pool](https://aws.amazon.com/cognito/pricing/) | 자격 증명 발급 무료 |
| [Firehose](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonKinesisFirehose/current/ap-northeast-2/index.json) | 수집 $0.036/GB + Parquet 변환 $0.022/GB. 레코드별 5KiB 올림 |
| [S3 Standard](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-northeast-2/index.json) | 첫 50TB 구간 $0.025/GB·월. 요청 비용 별도 |
| [Athena SQL](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonAthena/current/ap-northeast-2/index.json) | 스캔 $5/TB |
| [Glue Catalog](https://aws.amazon.com/glue/pricing/) | 첫 100만 객체·월 100만 요청 무료 범위. Crawler·ETL 미사용 |

1KiB 이벤트를 월 300만 건 보내면 Firehose 수집·변환은 약 $0.83이다. 배치 API를 사용해도 레코드별 올림은 유지된다. S3는 누적 저장량, Athena는 실제 스캔량에 따라 별도 계산한다. S3 요청·CloudWatch·외부 전송·Grafana 요금도 별도다.

## Kinesis 확장

스트림 재읽기, 독립적인 여러 소비자, 24시간보다 긴 스트림 보존이 필요하면 Kinesis Data Streams를 앞단에 추가할 수 있다.

```text
이벤트 큐 → Kinesis → Firehose → S3 → Athena
                 └→ 실시간 소비자
```

전환 시 전송 대상·권한과 Firehose 소스를 변경한다. 구버전 클라이언트가 사용하는 DirectPut 경로는 전환 기간에 유지하고 `event_id`로 중복 제거한다.

서울 Provisioned 1샤드의 시간 비용은 월 730시간 기준 약 $13.51이며 PUT 비용이 추가된다(2026-10-14 단가). [Kinesis 가격](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonKinesis/current/ap-northeast-2/index.json)
