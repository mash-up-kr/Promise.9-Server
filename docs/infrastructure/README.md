# Infrastructure

Promise.9의 AWS 접근과 CDK 운영 문서입니다.

## 문서 목록

| 문서                           | 내용                                       |
| ------------------------------ | ------------------------------------------ |
| [Why CDK](./why-cdk.md)        | CDK를 선택한 이유와 관리 원칙              |
| [Access](./access.md)          | 개인 IAM User와 Team Group                 |
| [IAM Users](./iam-users.md)    | 관리자용 팀원 계정 추가·제거 절차          |
| [CDK](./cdk.md)                | CDK 사용, 최초 적용과 배포 절차            |
| [Lightsail](./lightsail.md)    | Lightsail CDK 관리 범위와 변경 규칙        |
| [Static Assets](./assets.md) | S3·CloudFront 공용 이미지와 버전별 업로드 |
| [SES](./ses.md)                | SES 발신 도메인과 애플리케이션 권한        |
| [분석 인프라](./analytics.md) | 운영용 Cognito·Firehose·S3·Glue·Athena 구성과 검증 |
| [비즈니스 이벤트 수집 설계](./analytics-event-design.md) | 공통 이벤트·UTM·이벤트 큐·Firehose 수집, CDK 구성안과 비용 |
| [Team Guide](./team/README.md) | AWS CLI를 처음 사용하는 팀원용 시작 가이드 |
