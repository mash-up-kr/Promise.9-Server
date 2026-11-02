# PR #144: [feature] 클라이언트 이벤트 수집 인프라와 공통 계약 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/144
- Author: @vcz-Chan
- Base: main
- Head: feature/analytics-infrastructure
- Merged: 2026-11-02T11:54:46Z

## PR Body

## 개요

비즈니스 이벤트를 Firehose로 받아 S3에 장기 보관하고 Athena로 분석할 수 있는 인프라와 공통 이벤트 계약을 추가합니다.

## 변경 내용

- 서울 리전에 Cognito Identity Pool·Firehose·S3·Glue·Athena 운영용 한 세트 구성
- 게스트 임시 자격 증명에 지정 스트림의 `PutRecordBatch`만 허용
- JSON → Snappy Parquet 변환, UTC 도착 날짜(`arrival_date`) 파티션, 64MiB / 300초 버퍼
- 정상 이벤트 계속 보관, 오류·쿼리 결과 7일 만료, S3 공개 차단·암호화·리소스 보존
- 공통 이벤트 14개 필드, UTM 캠페인 5개 필드, 이벤트별 `custom_data` JSON 문자열 계약
- `feature/*` 대상 PR의 CI 실행 및 CDK 테스트 추가

## 검증

- 현재 커밋의 CI 통과: lint, 단위 테스트, CDK 타입 검사·테스트·합성, 빌드
- 2026-10-21 `Promise9AnalyticsStack` AWS 배포 완료
- 실제 프론트 수집 코드 → Cognito → Firehose → S3 Parquet → Athena 경로로 테스트 3건 확인. UTM과 중첩 `custom_data` 원본 일치

## PR 스택

`main` ← **#144 인프라·이벤트 계약** ← #146 계정 UTM API

#144를 먼저 병합하고, #146의 base를 `main`으로 전환해 순서대로 병합합니다. 날짜 파티션만 사용하며 동적 파티셔닝은 적용하지 않습니다.
