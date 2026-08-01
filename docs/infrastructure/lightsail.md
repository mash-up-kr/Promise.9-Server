# Lightsail

Promise9의 기존 Lightsail Instance와 Static IP를 `Promise9LightsailStack`에서 관리한다.

## 관리 리소스

| CDK 리소스     | Physical name | 역할                         |
| -------------- | ------------- | ---------------------------- |
| `CfnInstance`  | `Ubuntu-1`    | 운영·공유 Stage 서버         |
| `CfnStaticIp`  | `StaticIp-1`  | Instance의 고정 public IP    |

Instance의 blueprint, bundle, Availability Zone, key pair와 public firewall를 CDK 코드에
정의한다. Static IP 연결도 같은 Stack에서 관리한다.

CDK는 서버 내부의 Docker, Nginx, 파일과 환경변수를 관리하거나 컨테이너를 실행하지
않는다. 애플리케이션 배포는 [Lightsail Docker Deployment](../deploy/lightsail-docker.md)와
[PR Stage Deployment](../deploy/stage-pr-deployment.md)를 따른다.

## 변경 규칙

- Instance와 Static IP에는 `RemovalPolicy.RETAIN`을 적용한다.
- `Promise9LightsailStack`의 termination protection을 유지한다.
- `InstanceName`, `BlueprintId`, `BundleId`, `AvailabilityZone`과 `StaticIpName`은 생성
  전용 속성이므로 변경하지 않는다.
- `cdk diff`에 Lightsail 생성·교체·삭제가 표시되면 배포하지 않는다.
- 운영과 Stage가 같은 Instance를 사용하므로 Instance 교체는 두 환경을 모두 중단시킨다.
- Firewall 변경은 GitHub Actions의 SSH 배포 경로에 미치는 영향을 함께 검토한다.
