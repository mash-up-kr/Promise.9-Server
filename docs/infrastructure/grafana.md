# 백엔드 Grafana 연결

백엔드는 OpenTelemetry SDK에서 Grafana Cloud로 OTLP/HTTP protobuf를 직접 보낸다. 호스트의 CPU·메모리·디스크는 별도 Alloy 컨테이너에서 수집한다. 이 문서는 백엔드 관측성의 설정·운영 절차를 다룬다. 비즈니스 이벤트의 Firehose → S3 → Athena 장기 보관은 별도 작업이며 이 변경에 포함하지 않는다.

**PR 작성 시점의 상태:**

| 항목 | 상태 |
| --- | --- |
| API 계측·로그·에러 처리 | 구현 완료, 운영 반영 전 |
| Grafana `dev` 연결 | 전용 토큰으로 실제 APM·로그·트레이스·메트릭 수신 확인 |
| 호스트 CPU·메모리·디스크 | Alloy·배포 설정 검증 완료, 실제 서버 설치 전 |
| 운영 `production` 연결 | 운영 정책만 생성. 토큰 발급·GitHub 설정·배포·수신 확인은 머지 시 진행 |

## Lightsail·Docker 구성 기준

배포 대상은 [CDK Lightsail 정의](../../infra/lib/lightsail-stack.ts)의 `Ubuntu-1` 인스턴스(`ap-northeast-2a`, Ubuntu 24.04)다. [운영 배포 구성](../deploy/lightsail-docker.md)에 따라 호스트 Nginx가 `promise9-api` 컨테이너로 요청을 전달하고, API는 같은 서버의 `promise9-db` PostgreSQL 컨테이너를 사용한다. Kubernetes 클러스터·Pod·DaemonSet을 사용하지 않는다.

| 관측 대상 | 현재 수집 경로·범위 | Grafana에서 볼 항목 |
| --- | --- | --- |
| `promise9-api`의 NestJS | 프로세스 내부 OpenTelemetry SDK → Cloud OTLP | Application의 지연 시간·요청률·오류율, Tempo trace, Loki 로그 |
| 같은 Node 프로세스의 런타임 | SDK의 Node runtime instrumentation | 이벤트 루프·V8 메모리·GC |
| Lightsail 호스트 | Alloy unix exporter → Cloud Prometheus | CPU·메모리·파일시스템 용량·디스크 I/O, 60초 간격 |
| 호스트 Nginx | 아직 수집하지 않음 | 앱에 도달하기 전의 502/504, access/error 로그는 별도 설정 필요 |
| `promise9-db` PostgreSQL | DB 자체 지표·로그와 쿼리 span은 아직 수집하지 않음 | 연결 수·잠금·DB 성능은 별도 DB 수집 설정 필요 |

앱의 HTTP 지연 시간은 NestJS가 처리한 구간이다. Nginx나 서버 전체의 상태를 모두 포함하는 값으로 해석하지 않는다. Node 런타임 메모리도 Lightsail 호스트 전체 메모리 사용량이 아니다.

서비스 이름은 `promise9-api`, 논리적 서비스 그룹 `service.namespace`는 `promise9`다. Grafana의 `Namespace` 필터가 이 서비스 그룹을 보여주는 것이며 Kubernetes namespace를 뜻하지 않는다. 환경은 로컬 `dev`, 운영 `production`으로 구분하고, 운영 `host.id`는 컨테이너 재생성에도 유지되는 Lightsail 인스턴스 식별자를 사용한다.

이 스택은 Application Observability를 활성화하고 Kubernetes Monitoring은 비활성화했다. Application Observability의 환경 필터는 `deployment_environment_name`을 사용하며 `deployment_environment`도 함께 전송한다.

## 무료 플랜 운영 기준

**Grafana Cloud 무료 티어 범위로 운영한다.** 2026-10-15 **Manage plan**에서 `Cloud Free`, `Usage capped to Free tier limits`를 확인했다. 계정에 표시된 2026-10-27까지의 체험 제공량과 무료 제공량은 구분한다.

다음은 2026-10-17 [공식 가격표](https://grafana.com/pricing/)에서 재확인한 무료 기준이다.

| 항목 | 무료 기준 | 적용 범위 |
| --- | --- | --- |
| 메트릭 | 10,000 active series | API·Node 런타임·APM 생성 메트릭·호스트 메트릭을 합산 |
| 로그 | 월 50GB | 앱과 향후 추가되는 인프라 로그를 합쳐 관리 |
| 트레이스 | 월 50GB | 백엔드 trace 및 이후 연계할 trace를 합쳐 관리 |
| Application Observability | 월 2,232 host-hours | 실제 신호를 보내는 호스트의 시간 합계 |
| 메트릭·로그·트레이스 보존 | 14일 | 몇 달치 비즈니스 이벤트 보관은 Firehose → S3 → Athena로 분리 |

2026-10-15 **Current usage** 화면의 APM 한도는 `3000 host hours`로 공식 가격표와 달랐다. 원인은 확인되지 않아 운영 설계는 더 작은 **2,232**를 기준으로 한다.

Lightsail 한 대를 31일 내내 관측하면 최대 `1 × 24 × 31 = 744 host-hours`다. 로컬 dev 호스트도 데이터를 보내는 동안 사용량에 포함되므로 환경이 다르다고 별도 무료 한도가 생기는 것은 아니다. 컨테이너 재시작마다 다른 호스트로 인식되지 않도록 안정적인 `host.id`를 사용한다. APM host-hours와 로그·트레이스·메트릭 사용량은 별개로 확인한다. [APM 과금 기준](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/application-observability/)

운영 데이터가 아직 없어 월 로그·trace 용량과 최종 active series를 확정할 수 없다. 배포 후 **Cost Management and Billing → Usage**에서 실제 값과 한도를 확인하고, 한도에 접근하면 사용하지 않는 지표·정상 요청 로그·trace 샘플링 정책을 팀과 조정한다. 무료 한도 초과 시 수집이 제한될 수 있다. 위 무료 기준은 Grafana 요금이며 Lightsail·AWS 데이터 전송·S3·Athena 비용은 별도다.

## 수집 범위

| 대상 | 현재 구현 |
| --- | --- |
| HTTP 요청 | 라우트, 메서드, 상태 코드, 소요 시간, 요청 ID |
| 트레이스 | HTTP 서버, Nest 컨트롤러, Express 핸들러, HTTP/HTTPS·fetch 외부 호출 |
| 로그 | 기존 Nest `Logger` 호출을 JSON으로 출력하고 같은 내용을 OTLP로 전송 |
| 에러 | 예상하지 못한 예외도 공통 500 응답으로 처리. 내부 오류 종류·스택은 로그에 기록 |
| 연계 | 로그의 `request_id`, `trace_id`, `span_id`, `trace_sampled`; 응답의 `x-request-id`, `x-trace-id` |
| 메트릭 | 요청 수·지연 시간 히스토그램, Node 이벤트 루프·V8 메모리·GC |
| 제외 | DB 쿼리 span, SQS 메시지 사이의 trace context 전달, 호스트/Nginx/Postgres 자체 로그, 프론트 RUM·리플레이 |

현재 DB는 `postgres.js`를 사용한다. `pg` 전용 자동 계측으로 DB 쿼리가 수집된다고 가정하면 안 된다. 백그라운드 작업의 기존 Nest 로그도 전송되지만, 활성 span이 없는 작업에는 trace ID가 없다.

## 기본 동작

- `OTEL_ENABLED=false`가 기본이다. Grafana 인증정보 없이도 부팅하며 JSON 로그와 요청 ID는 사용할 수 있다.
- `main.ts`의 첫 import가 `instrumentation.ts`다. SDK가 Nest/HTTP 라이브러리를 먼저 계측할 수 있도록 이 순서를 유지한다. 개발 실행과 Docker의 `node dist/main.js`가 같은 진입점을 사용한다.
- 정상 요청과 4xx 접근 로그는 `info`, 5xx 접근 로그와 연결 중단은 `warn`, 5xx 예외 상세는 `error`다. 4xx 예외 상세는 `debug`다. 접근 로그의 `error_code`로 비즈니스 오류 코드를 확인할 수 있다.
- 예상하지 못한 500의 응답 메시지는 `서버 내부 오류가 발생했습니다.`이며 내부 오류 메시지를 응답에 포함하지 않는다. 기존 `BaseException`의 상태·오류 코드·부가 데이터는 유지한다.
- 로그·트레이스는 최대 2,048개 메모리 큐에서 최대 512개씩, 통상 5초마다 전송한다. 메트릭은 60초마다 전송한다. exporter 요청 timeout은 5초다.
- Nest 종료 시 작업 drain/HTTP 종료 후 마지막 배치를 flush한다. Docker API 컨테이너에 종료 유예 1분을 설정한다. SIGKILL·프로세스 강제 종료·전송 실패·큐 초과 시 원격 데이터가 빠질 수 있다. stdout 로그는 Docker의 기존 rotation 정책을 따른다.
- 처리되지 않은 예외·Promise rejection은 마스킹한 fatal JSON을 stderr에 동기 기록하고 exit code 1로 종료한다. Node의 원문 스택 재출력을 막으며, 비정상 상태에서 비동기 OTLP flush를 기다리거나 요청 처리를 재개하지 않는다. 따라서 이 마지막 fatal의 Cloud 수신은 보장하지 않는다. [Node 프로세스 예외 처리](https://nodejs.org/api/process.html#event-uncaughtexception)
- HTTP 요청 메트릭과 로그는 trace 샘플링과 독립적이다. `OTEL_TRACES_SAMPLER_ARG`는 루트 trace의 샘플링 비율이며, 상위 trace가 있으면 그 결정을 따른다. 샘플링되지 않은 trace의 로그에는 ID가 있어도 Tempo에 해당 trace가 없을 수 있다.
- 정상 GET/HEAD `/api/v1` 헬스체크는 접근 로그·요청 메트릭에서 제외하며, 해당 경로의 HTTP trace는 제외한다. 헬스체크 실패는 접근 로그·메트릭에 남긴다.
- 클라이언트가 응답 전에 연결을 끊으면 `aborted=true`, `status_code=0`으로 기록한다. 이는 실제 HTTP 응답 코드가 아니다.

## 데이터 처리

접근 로그·메트릭에는 `/api/v1/links/:id` 같은 등록된 라우트를 사용한다. 404는 `unmatched`로 모은다. 요청/응답 본문, 인증 헤더, 원본 URL, 쿼리, SQL 파라미터를 자동 수집하지 않는다. ID와 URL을 메트릭 label로 사용하지 않는다.

트레이스 속성은 `redacting-span.processor.ts`의 허용 목록만 전송한다. 로그는 민감한 키, URL 인증정보·쿼리, Bearer/Basic/JWT, 이메일, Drizzle 쿼리 오류 패턴을 가린다. 임의의 자유 텍스트에 포함된 모든 개인정보를 판별하는 기능은 아니므로, 새로운 로그에 사용자 입력·요약 본문·토큰을 직접 넣지 않는다.

새 로그는 다음처럼 안정적인 이벤트명과 필요한 내부 식별자, 오류 객체를 사용한다. `request_id`/`trace_id`는 로거가 자동으로 붙인다.

```ts
this.logger.error({ event: 'link.analysis_failed', link_id: linkId, error })
```

## Grafana 계정 설정

스택은 [fearlessmint2115](https://fearlessmint2115.grafana.net)다. 수신 정보는 **Connections → Add new connection → OpenTelemetry (OTLP) → View connection details**에서 확인한다.

- OTLP base endpoint: `https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp`
- Instance ID: `1871191`
- Protocol: `http/protobuf`

브라우저용 Faro 수집 주소와 다르다. SDK가 base endpoint 뒤에 `/v1/traces`, `/v1/logs`, `/v1/metrics`를 붙인다. [Grafana OTLP 연결 문서](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/)

백엔드용 토큰에는 해당 스택의 `metrics:write`, `logs:write`, `traces:write`만 부여한다. dev·운영 정책과 토큰은 분리하고, 토큰은 만료일 없이 관리한다.

- dev 정책: `promise9-backend-dev-telemetry`. 로컬 토큰은 Git에서 제외된 `.env.local`에 `600` 권한으로 저장한다.
- 운영 정책: `promise9-backend-production-telemetry`. 토큰은 운영 설정 시 발급해 GitHub Actions Secret에 저장한다.

`OTEL_EXPORTER_OTLP_HEADERS` 값은 `Authorization=Basic <base64(instance-id:token)>` 형식이다. 대괄호 부분은 실제 값이 아닌 설명용 표기이며 **base64도 비밀값**이다. Grafana의 Node용 안내에 공백을 `%20`으로 인코딩한 값이 제공되면 그대로 사용한다. 인증정보를 저장소에 커밋하지 않는다.

로컬 `.env.local` 예시:

```dotenv
APP_ENV=development
LOG_LEVEL=info
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# OTEL_EXPORTER_OTLP_HEADERS는 비밀 저장소에서 설정
OTEL_SERVICE_NAME=promise9-api
OTEL_SERVICE_VERSION=local
OTEL_HOST_ID=promise9-local-dev
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev,deployment.environment.name=dev
OTEL_TRACES_SAMPLER_ARG=1
```

`.env.local`은 자동으로 로드되지 않는다. 로컬 빌드 실행 시 `node --env-file=.env.local dist/main.js`처럼 명시하며, 실제 API 실행에 필요한 개발 DB 등 기존 환경변수도 설정해야 한다.

`OTEL_RESOURCE_ATTRIBUTES`를 사용하면 추가 resource 속성을 지정할 수 있다. 기본 namespace는 `promise9`, 환경은 `APP_ENV`, instance는 컨테이너 hostname과 PID다. 운영에서는 `OTEL_HOST_ID`를 배포마다 바뀌는 컨테이너 ID가 아닌 안정적인 Lightsail 호스트 식별자로 설정한다.

로컬 수집은 위 예시처럼 `deployment.environment`와 `deployment.environment.name`을 모두 `dev`로 재정의한다. 환경 변수 resource detector가 코드의 기본 resource 값보다 우선하며 로그·트레이스·메트릭에 공통 적용된다. `APP_ENV=development`는 애플리케이션 설정과 개발 DB 선택에 사용하므로 `dev`로 바꾸지 않는다. 같은 스택에서 환경 필터로 구분하는 방식이며 별도 저장소나 접근 권한 경계는 아니다.

Knowledge Graph는 `deployment.environment.name` 또는 `deployment.environment`로 애플리케이션 환경을 구분한다. [Application Observability 환경 구분](https://grafana.com/docs/grafana-cloud/platform/knowledge-graph/get-started/manage-datasets/application/application-metrics/)

## Lightsail 배포 설정

운영 요청을 관측하려면 계측 코드를 포함한 백엔드를 배포하고 운영 인증정보로 수집을 켠다. API는 SDK에서 직접 전송하며 Alloy는 호스트 메트릭만 수집한다.

`.github/workflows/deploy-lightsail.yml`이 아래 값들을 런타임 `.env`에 전달한다. 설정하지 않으면 기존 배포는 원격 수집을 끈 상태로 동작한다.

| GitHub 설정 | 이름 | 내용 |
| --- | --- | --- |
| Variable | `OTEL_ENABLED` | 활성화 시 `true` |
| Variable | `OTEL_EXPORTER_OTLP_ENDPOINT` | 위 base endpoint |
| Secret | `OTEL_EXPORTER_OTLP_HEADERS` | 인증 헤더 전체 |
| Variable | `OTEL_HOST_ID` | 안정적인 Lightsail 호스트 식별자. 활성화 시 필수 |
| Variable | `OTEL_TRACES_SAMPLER_ARG` | 기본 `1` |
| Variable | `LOG_LEVEL` | 기본 `info`; `debug`, `warn`, `error` 가능 |

배포 workflow는 `OTEL_SERVICE_VERSION`에 Git commit SHA를 기록한다. Grafana 장애가 HTTP 요청을 기다리게 하지는 않지만, 잘못된 endpoint 설정은 시작 시 검증 오류가 된다. 401/403/429 및 전송 오류는 `context=OpenTelemetry`인 로컬 stderr 로그로 확인한다.

운영 환경은 `APP_ENV=production`에서 기본 resource 값 `deployment.environment=production`, `deployment.environment.name=production`을 사용한다. 로컬용 `dev` override를 운영에 복사하지 않는다.

### 호스트 CPU·메모리·디스크

[Compose](../../docker-compose.observability.yml)와 [Alloy 설정](../../deploy/observability/config.alloy)을 준비했다. API·PostgreSQL과 별도 Compose project로 관리한다. 공식 `grafana/alloy:v1.20.1` 이미지의 `prometheus.exporter.unix`에서 `cpu`, `meminfo`, `filesystem`, `diskstats`, `uname`만 켜며, 전송 전 allowlist로 필요한 메트릭만 남긴다. [exporter 설정](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.exporter.unix/)

- 수집 간격 60초, 제한 시간 10초. 한 번에 500 samples를 넘으면 해당 scrape가 실패하도록 설정했다. 이 제한은 계정 전체 active series 한도와 다르다.
- 모든 호스트 메트릭에 `deployment_environment=production`, `deployment_environment_name=production`, `host_id=OTEL_HOST_ID`를 붙인다. API의 `host.id`와 같은 값을 사용한다.
- CPU 시간, 가용/전체 메모리·swap, 파일시스템 용량·inode·읽기 전용 상태, 디스크 I/O를 수집한다. 가상 파일시스템과 Docker mount는 제외한다.
- 호스트 파일시스템·proc·sys를 읽기 전용으로 연결한다. Docker socket과 privileged 모드는 사용하지 않고 Linux capability를 모두 제거한다.
- Alloy 진단 포트는 서버의 `127.0.0.1:12345`에만 연결한다. 컨테이너 최대 메모리는 256MiB, CPU는 0.25이며 실제 자원 사용량은 설치 후 확인한다.
- remote-write WAL은 named volume에 보관하고 최대 보관 시간을 2시간으로 제한한다. 429 응답·장애가 장기간 지속되면 전체 데이터 보존을 보장하지 않는다.

호스트 수집용 GitHub 설정은 다음과 같다. 기본값은 비활성이다.

| GitHub 설정 | 이름 | 내용 |
| --- | --- | --- |
| Variable | `HOST_METRICS_ENABLED` | 설치·실행 시 `true`. `false`이면 다음 배포 때 기존 `promise9-alloy`를 중지 |
| Variable | `OTEL_HOST_ID` | API와 같은 안정적인 Lightsail 호스트 ID |
| Variable | `GRAFANA_CLOUD_METRICS_URL` | Cloud Prometheus의 remote-write URL. OTLP 주소와 다름 |
| Variable | `GRAFANA_CLOUD_METRICS_USER` | Prometheus instance ID. OTLP instance ID와 혼동하지 않음 |
| Secret | `GRAFANA_CLOUD_METRICS_TOKEN` | 운영 수집 정책에 발급한 토큰. dev 토큰을 재사용하지 않음 |

workflow는 `/opt/promise9/.env.alloy`를 `600` 권한으로 저장한다. Alloy 설정 검증 후 수집기만 재생성하고 readiness를 확인한다. bind mount의 설정 파일 내용만 바뀌어도 새 설정을 읽도록 `--force-recreate`를 사용하며, WAL volume은 유지한다. readiness 성공은 Cloud 수신 성공을 뜻하지 않으므로 아래 조회까지 수행해야 한다. API의 수집 활성화는 `OTEL_ENABLED`로 따로 제어한다. [Alloy 설정 재적용](https://grafana.com/docs/alloy/latest/reference/cli/run/), [Compose 재생성](https://docs.docker.com/reference/cli/docker/compose/up/)

로컬·CI 설정 검증은 실제 인증정보 없이 실행한다.

```bash
bash script/check-alloy-config.sh
```

머지 후 CPU·메모리·디스크 확인용 PromQL:

```promql
100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{deployment_environment="production",mode="idle"}[5m])))
100 * (1 - node_memory_MemAvailable_bytes{deployment_environment="production"} / node_memory_MemTotal_bytes{deployment_environment="production"})
100 * (1 - node_filesystem_avail_bytes{deployment_environment="production",mountpoint="/"} / node_filesystem_size_bytes{deployment_environment="production",mountpoint="/"})
count({job="integrations/node_exporter",deployment_environment="production"})
```

### 운영 활성화와 롤백

1. PR의 CI 결과와 수집 범위를 확인한다.
2. 운영 토큰을 발급하고 위 GitHub 변수·Secret을 등록한다. Prometheus 연결 정보와 서버의 안정적인 호스트 ID도 이때 확인한다.
3. main 병합 후 자동 배포를 확인한다. PostgreSQL의 재시작·migration은 수행하지 않는다.
4. 운영 API 요청의 `x-trace-id`로 Tempo trace와 Loki 로그를 연결하고, APM에 `production / promise9 / promise9-api`가 나타나는지 확인한다. 에러 검증 방법은 배포 전에 팀과 정한다. 검증 전용 오류 API는 제품에 포함하지 않는다.
5. 호스트 메트릭의 환경·host ID·수집 series 수와 exporter 오류를 확인한다. dev 데이터를 함께 조회해 서로 다른 환경으로 표시되는지도 검증한다.
6. 문제가 있으면 앱은 `OTEL_ENABLED=false`로 재배포하고 호스트 수집은 `HOST_METRICS_ENABLED=false`로 중지할 수 있다. API 이미지 자체 문제는 직전 정상 이미지와 환경 파일로 복구한다.

## Grafana에서 확인

1. 수집을 켠 환경에서 API를 호출한다. 정상 헬스체크만 호출하면 요청 데이터가 나오지 않는다.
2. Logs/Traces Drilldown에서 `service.name=promise9-api`를 확인한다. 500 로그의 `trace_id`를 Tempo에서 조회한다.
3. Application Observability 설정에서 스택의 Traces/Metrics/Logs 데이터 소스와 **span metrics·service graph 생성**을 확인한다. SDK trace가 들어오는 것과 APM 기본 화면이 구성되는 것은 별도다. Cloud 쪽 metrics generation을 사용하면 Alloy 없이도 trace에서 APM 지표를 만들 수 있다. 이 메트릭도 Cloud 사용량에 포함된다. [APM 계측 요구사항](https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/application-observability-kg/setup/instrumentation/)
4. trace → logs 연계는 OTLP gateway/native Loki OTLP 모드에서 trace ID 필터를 사용한다. Loki → Tempo 연계가 기본 설정에 없다면 `trace_id` derived field를 추가한다. [APM 연계 설정](https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/application-observability/manual/configure/)

Loki 조회 예시:

```logql
{service_name="promise9-api"} | deployment_environment="dev" | json | event="http.exception" | status_code >= 500
```

```logql
{service_name="promise9-api"} | json | request_id="응답의 x-request-id"
```

요청 메트릭은 `promise9.http.server.requests`, `promise9.http.server.duration`으로 전송한다. Prometheus 이름 변환 후에는 통상 `promise9_http_server_requests_total`, `promise9_http_server_duration_seconds_bucket` 등으로 조회한다. Metrics Drilldown에서 실제 이름과 `job`/환경 label을 먼저 확인한다.

이 스택에서 확인한 Prometheus 조회 예시:

```promql
promise9_http_server_requests_total{job="promise9/promise9-api",deployment_environment="dev"}
```

```promql
traces_spanmetrics_calls_total{job="promise9/promise9-api",asserts_env="dev"}
```

RUM과 리플레이는 이 백엔드 변경에 포함하지 않는다. 이후 Faro에서 API 대상으로 `traceparent`를 전달하면 같은 trace로 연결할 수 있다. 서버는 해당 헤더를 추출하며 응답의 요청/trace ID를 CORS로 노출한다.

## 최초 Cloud 검증 결과 — 2026-10-15 KST

로컬 Nest fixture에서 HTTP 200 26건·HTTP 500 6건을 전송해 다음을 확인했다.

- APM에 `dev / promise9 / promise9-api`와 지연 시간·오류율·요청률이 표시됐다.
- Grafana의 요청 카운터가 전송한 26·6건과 일치하고, exporter 오류는 없었다.
- Loki의 접근·예외 로그와 Tempo의 오류 trace를 같은 trace ID로 조회했다. **Logs for this trace**에서 해당 요청의 접근·예외 로그 2건이 연결됐다.
- 테스트 오류의 URL 쿼리·이메일이 마스킹됐고 세 신호 모두 `dev` 환경으로 구분됐다.

이 결과는 fixture의 Cloud 수신 검증이며 제품 `AppModule`·실제 API·DB 검증은 아니다. 그래프와 지표의 초기 처리가 끝나야 APM 화면에 표시되므로 exporter 성공만으로 수신을 확정하지 않는다.
