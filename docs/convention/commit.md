# 커밋 컨벤션

커밋 메시지는 아래 형식을 사용합니다.

```text
<type>: <요약>

<본문 - 선택>
```

## 타입

| type | 의미 |
| --- | --- |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 |
| `refactor` | 리팩터링 |
| `test` | 테스트 |
| `chore` | 빌드, 설정 등 |

## 예시

```text
feat: 로그인 API 구현
fix: 토큰 만료 처리 오류 수정
docs: 브랜치 협업 가이드 추가
refactor: user service 책임 분리
test: auth service 단위 테스트 추가
chore: eslint 설정 정리
```
