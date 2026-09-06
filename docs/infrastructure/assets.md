# 공용 정적 에셋

`Promise9AssetsStack`은 이메일·브랜드 이미지 등 공개용 정적 에셋을 제공합니다.

- S3: 비공개, 공개 접근 차단, 암호화, 버전 관리, 삭제 시 보존
- CloudFront: 기본 도메인 사용, HTTPS, GET/HEAD만 허용
- OAC: 이 배포만 S3에서 이미지를 읽을 수 있음
- 사용자 업로드·개인정보 파일은 이 버킷에 넣지 않음
- API 서버의 IAM 권한은 변경하지 않음. 업로드는 운영자가 AWS CLI로 수행

## 최초 배포

```bash
aws login --profile promise9
bun run infra:typecheck
bun run infra:diff Promise9AssetsStack --profile promise9
bun run infra:deploy Promise9AssetsStack --profile promise9
```

다른 개인 계정의 기본 프로필로 배포하지 않도록 `--profile promise9`를 명시합니다.
Stack output은 `AssetsBucketName`, `AssetsDistributionId`, `AssetsBaseUrl`입니다.

## 이미지 배포

이미지는 레포에서 관리합니다. 현재 메일 에셋은 `email/assets/reminder/`에 있습니다.
원본 SVG는 보관하며 PNG 등 래스터 이미지만 업로드합니다.

```bash
# 네트워크 요청 없이 대상 폴더·파일 수·버전 경로 확인
bun run assets:publish

# 계정 확인 → 스택 output 조회 → 실제 업로드
bun run assets:publish --apply

# 다른 공용 이미지 묶음도 같은 방식으로 배포
bun run assets:publish --source <레포의-이미지-디렉터리> --prefix brand/logo --apply
```

프로필 기본값은 `promise9`이며 `--profile`로 지정할 수 있습니다.
각 source 디렉터리 바로 아래의 PNG/JPEG/GIF/WebP/AVIF만 대상으로 하며 하위 폴더와 심볼릭 링크는 제외합니다.
파일명·내용으로 계산한 해시가 경로에 포함됩니다:

```text
https://<distribution>.cloudfront.net/email/reminder/<content-hash>/banner.png
https://<distribution>.cloudfront.net/brand/logo/<content-hash>/logo.png
```

기존 객체는 해시를 확인해 건너뜁니다. 업로드에는 조건부 쓰기와 체크섬을 사용하며 기존 객체를 덮어쓰거나 삭제하지 않습니다.
`Cache-Control: public,max-age=31536000,immutable`을 적용합니다.
새 파일 버전은 새 경로를 사용하므로 캐시 무효화가 필요하지 않습니다.
예전에 보낸 이메일을 위해 이전 버전은 유지합니다. `aws s3 sync --delete`나 자동 만료 lifecycle을 설정하지 않습니다.

## 이메일 연결

업로드가 끝나면 출력되는 `EMAIL_ASSET_BASE_URL` 전체 값을 GitHub Actions의 **repository variable**로 등록합니다.
비밀값이 아니므로 Secrets는 필요하지 않습니다.

```text
EMAIL_ASSET_BASE_URL=https://<distribution>.cloudfront.net/email/reminder/<content-hash>
```

Lightsail 배포 workflow가 이 값을 런타임 환경변수로 전달합니다. 배포된 서버부터 HTTPS 이미지 URL을 사용하고 이미지 첨부를 생략합니다.
설정이 없으면 기존 CID 첨부를 사용하므로 인프라·이미지·서버를 순서대로 배포할 수 있습니다.
다른 버전으로 전환할 때는 먼저 모든 이미지를 업로드하고 공개 URL을 확인한 뒤 변수를 변경합니다.

## 확인

- CloudFront URL에서 PNG가 200과 `Content-Type: image/png`로 반환되는지 확인
- 동일 S3 객체의 익명 직접 접근은 거부되어야 함
- 새 서버 배포 후 실제 이메일 수신 확인

CloudFront/S3의 요청·전송·저장 요금은 AWS 사용량에 따라 발생합니다.
