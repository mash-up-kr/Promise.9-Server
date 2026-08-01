# Lightsail

Promise9의 기존 Lightsail Instance와 Static IP를 `Promise9LightsailStack`에서 관리한다.

## 관리 리소스

| CDK 리소스     | Physical name | 역할                         |
| -------------- | ------------- | ---------------------------- |
| `CfnInstance`  | `Ubuntu-1`    | 운영·공유 Stage 서버         |
| `CfnStaticIp`  | `StaticIp-1`  | Instance의 고정 public IP    |

Instance의 blueprint, bundle, Availability Zone, key pair와 public firewall를 CDK 코드에
정의한다. Static IP 연결도 같은 Stack에서 관리한다.

실제 IP 주소, ARN, SSH private key와 서버의 환경변수는 CDK 코드에 기록하지 않는다.

## 서비스 연결

하나의 Instance에서 운영과 공유 Stage 컨테이너를 함께 실행한다.

```text
StaticIp-1
  → Nginx 80/443
      ├─ 운영 API: 127.0.0.1:3000
      └─ 공유 Stage API: 127.0.0.1:3001
```

상세 배포 흐름은 [Lightsail Docker Deployment](../deploy/lightsail-docker.md)와
[PR Stage Deployment](../deploy/stage-pr-deployment.md)를 따른다.

## CDK 관리 대상이 아닌 것

Lightsail 리소스를 CDK로 관리해도 다음 서버 내부 상태는 자동으로 재현되지 않는다.

- Docker Engine과 실행 중인 컨테이너
- `/opt/promise9`, `/opt/promise9-stage` 파일
- Nginx와 certbot 설정
- GitHub Actions Secret과 SSH private key
- 애플리케이션 환경변수와 외부 Database

서버를 교체해야 한다면 위 항목의 별도 복구 절차가 필요하다.

## 변경 규칙

- Instance와 Static IP에는 `RemovalPolicy.RETAIN`을 적용한다.
- `Promise9LightsailStack`의 termination protection을 유지한다.
- `InstanceName`, `BlueprintId`, `BundleId`, `AvailabilityZone`과 `StaticIpName`은 생성
  전용 속성이므로 변경하지 않는다.
- `cdk diff`에 Lightsail 생성·교체·삭제가 표시되면 배포하지 않는다.
- 운영과 Stage가 같은 Instance를 사용하므로 Instance 교체는 두 환경을 모두 중단시킨다.
- Firewall 변경은 GitHub Actions의 SSH 배포 경로에 미치는 영향을 함께 검토한다.
- Snapshot, Backup과 Tag 정책은 별도 PR로 관리한다.
