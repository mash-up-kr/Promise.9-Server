# PR #32: [feature] URL 보안 검증 서비스 추가

- URL: https://github.com/mash-up-kr/Promise.9-Server/pull/32
- Author: @vcz-Chan
- Base: main
- Head: feat/url-security
- Merged: 2026-07-06T14:22:30Z

## PR Body

## 📌 개요
외부 URL을 서버에서 요청하기 전에 사용할 수 있는 URL인지 검증하는 `UrlSecurityService`를 추가했습니다.
http/https URL만 허용하고, 로컬 주소나 내부망 주소로 연결되는 URL은 거부합니다.

## ✅ 작업 내용 및 변경 사항
- [x] http/https URL 파싱 로직 추가
- [x] 도메인을 DNS로 조회한 뒤 공개 IP인지 검증
- [x] localhost, 사설 IP, link-local, EC2 metadata 주소 차단
- [x] IPv4-mapped IPv6도 내부 IPv4 여부를 다시 검사
- [x] 실제 요청에 사용할 연결 IP 반환
- [x] IP/호스트 차단 판정 로직을 `url-security.checker.ts`로 분리
- [x] URL 검증 테스트 추가

## 💬 리뷰어에게
외부 URL을 다루는 다른 기능에서도 재사용할 수 있도록 `UrlSecurityModule`로 분리했습니다.

여기서 공개 IP는 인터넷에서 일반적으로 접근 가능한 IP를 의미합니다.
반대로 서버 내부망, 로컬 머신, 클라우드 metadata 주소처럼 외부 사용자가 직접 접근하게 하면 안 되는 주소는 차단합니다.

차단 범위가 현재 서비스 운영 환경에 맞는지 중점적으로 봐주세요.
특히 단일 EC2 환경이어도 `localhost`, `169.254.169.254`, VPC 내부 주소로 요청이 나가면 서버 내부 리소스에 접근할 수 있어서 막는 방향으로 잡았습니다.

## 🔗 관련 이슈
없음

## 🔍 상세 내용
주요 흐름은 다음과 같습니다.

1. 입력 URL을 `URL`로 파싱합니다.
2. `http`, `https`가 아니면 거부합니다.
3. 호스트가 `localhost`, `.localhost`, `.local`이면 거부합니다.
4. IP 주소가 직접 들어온 경우 공개 IP인지 확인합니다.
5. 도메인인 경우 DNS 조회 결과를 모두 확인하고, 내부망 IP가 하나라도 있으면 거부합니다.
6. 검증된 공개 IP를 호출부에 반환합니다.

공개 IP는 아래 차단 범위에 속하지 않는 IP로 봅니다.
즉, 서버 내부나 특수 네트워크가 아니라 인터넷을 통해 접근 가능한 일반 외부 주소만 허용합니다.

현재 차단하는 IPv4 범위는 다음과 같습니다.

- `0.0.0.0/8`: 현재 네트워크를 의미하는 특수 주소
- `10.0.0.0/8`: 사설망 주소
- `100.64.0.0/10`: carrier-grade NAT 주소
- `127.0.0.0/8`: localhost
- `169.254.0.0/16`: link-local 주소, EC2 metadata 주소 포함
- `172.16.0.0/12`: 사설망 주소
- `192.168.0.0/16`: 사설망 주소
- `224.0.0.0/4` 이상: multicast, 예약 대역 등 일반 외부 요청 대상으로 보기 어려운 주소

현재 차단하는 IPv6 범위는 다음과 같습니다.

- `::`: 지정되지 않은 주소
- `::1`: localhost
- `fc00::/7`: unique local address, 내부망 용도
- `fe80::/10`: link-local 주소

IPv4-mapped IPv6는 내부 IPv4 주소를 숨길 수 있으므로 IPv4 주소로 풀어서 같은 차단 규칙을 적용합니다.

도메인은 DNS 조회 결과를 모두 검사합니다.
하나의 도메인이 공개 IP와 내부 IP를 함께 반환하면 내부망으로 연결될 가능성이 있으므로 거부합니다.
