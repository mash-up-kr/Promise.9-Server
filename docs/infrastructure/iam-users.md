# IAM User 관리

관리자가 팀원의 IAM User를 추가·제거하는 절차다. 관리자 자격 증명은 공유하지 않는다.

## 팀원 추가

IAM User 이름은 `promise9-<팀 식별자>` 형식을 사용한다.

```bash
aws iam create-user \
  --user-name <IAM-User-name> \
  --profile <관리자-profile>

aws iam add-user-to-group \
  --group-name Promise9Team \
  --user-name <IAM-User-name> \
  --profile <관리자-profile>
```

Access Key는 생성하지 않는다. AWS Console에서 Console 접근과 최초 비밀번호 변경을
활성화하고, 임시 비밀번호는 비밀번호 관리자나 개인 DM으로 당사자에게만 전달한다.

팀원에게 전달할 정보:

- IAM 로그인 URL: `https://743070678932.signin.aws.amazon.com/console/`
- 개인 IAM User 이름
- 임시 비밀번호

팀원은 즉시 비밀번호를 변경하고 MFA를 등록한다. 관리자는 MFA 등록을 확인하며, 완료되지
않으면 해당 User를 `Promise9Team`에서 제거한다.

```bash
aws iam list-mfa-devices \
  --user-name <IAM-User-name> \
  --profile <관리자-profile>
```

## 가입 확인

```bash
aws iam get-group \
  --group-name Promise9Team \
  --query 'Users[].UserName' \
  --profile <관리자-profile>
```

개별 User에 직접 정책을 연결하지 않는다. 모든 팀 권한은 `Promise9Team`을 통해 부여한다.

## 팀원 제거

먼저 Group에서 제거해 관리자 권한을 회수한다.

```bash
aws iam remove-user-from-group \
  --group-name Promise9Team \
  --user-name <IAM-User-name> \
  --profile <관리자-profile>
```

AWS는 요청마다 현재 IAM 정책을 평가하므로 Group 권한은 정책 전파 후 기존 `aws login`
세션에도 더 이상 적용되지 않는다. 다음 항목을 함께 확인한다.

- 다른 Group, 직접 연결된 managed/inline policy
- Console 접근과 Access Key
- MFA Device와 CloudTrail 최근 작업

남은 자격 증명과 정책을 제거한 뒤 IAM User를 삭제한다.
