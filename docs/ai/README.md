# AI

AI 기능을 사용하거나 내부 생성 흐름을 수정할 때 참고하는 문서다.

| 문서                                     | 내용                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| [사용 가이드](./usage.md)                | `AiService` 사용법, 입력·출력 파라미터, metrics 자동 기록 |
| [생성 흐름 상세](./generation-detail.md) | LLM provider 호출, 오류 변환, metrics 저장 흐름           |
| [단일 호출 전환과 NEEDS_REVIEW](./link-analysis-single-call.md) | 요약, 태그 1회 호출 통합, 검토 상태 전이와 확인 방법 |

현재 도메인별 public AI 유스케이스는 `generateLinkAnalysis` 하나다. 링크 요약, 태그, 개발자 검토 필요 여부를 LLM 1회 호출로 함께 생성한다.

임베딩을 링크 검색에 어떻게 쓰는지는 [Search](../search/README.md) 문서를 참고한다.
