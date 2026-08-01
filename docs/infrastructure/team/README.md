# Infrastructure Team Guide

AWS CLI를 처음 사용하는 Promise.9 팀원을 위한 시작점입니다.

관리자가 개인 IAM User를 생성하고 `Promise9Team` Group에 배정한 뒤 사용한다. 팀원은
`promise9` profile 하나로 AWS CLI와 CDK를 사용하며 별도 관리자 계정을 알 필요가 없다.

## 가이드 목록

| 문서                                    | 내용                           |
| --------------------------------------- | ------------------------------ |
| [AWS CLI](./aws-cli.md)                 | CLI 설치, 패스키와 `aws login` |
| [CDK](./cdk.md)                         | CDK 변경 확인과 배포 절차      |
| [Troubleshooting](./troubleshooting.md) | 자주 발생하는 오류 해결        |

AWS를 사용하기 전에 [AWS Access](../access.md)의 권한과 금지 사항을 확인합니다.
