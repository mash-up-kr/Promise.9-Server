import {
    LINK_ANALYSIS_MESSAGE_VERSION,
    LINK_ANALYSIS_TASKS,
} from './link-analysis.constant'

// 저장된 링크의 비동기 분석을 시작할 때 필요한 식별자와 원문 URL.
export type LinkAnalysisInput = {
    linkId: number
    userId: number
    url: string
}

export type LinkAnalysisTask = (typeof LINK_ANALYSIS_TASKS)[number]

// 다시 실행하면 결과가 달라질 수 있는 실패와, 반복해도 같은 실패를 구분한다.
// PERMANENT는 큐에 넣지 않고 즉시 종료해 DLQ 오염과 불필요한 재시도를 막는다.
export type LinkAnalysisFailureKind = 'RETRYABLE' | 'PERMANENT'

export type LinkAnalysisTaskResult =
    | { task: LinkAnalysisTask; status: 'SUCCESS' }
    | { task: LinkAnalysisTask; status: 'SKIPPED'; reason: string }
    | {
          task: LinkAnalysisTask
          status: 'FAILED'
          kind: LinkAnalysisFailureKind
          error: unknown
      }

export type LinkAnalysisRetryMessage = {
    version: typeof LINK_ANALYSIS_MESSAGE_VERSION
    linkId: number
    userId: number
    url: string
    tasks: LinkAnalysisTask[]
    // 인라인 시도를 1로 세는 누적 시도 횟수. 관측과 로그 상관관계 확인에만 쓰고,
    // 실제 재시도 상한은 SQS redrive maxReceiveCount가 결정한다.
    attempt: number
}

// 실행 계약은 LinkAnalysisService·LinkAnalysisDispatcher 클래스가 직접 표현한다.
// NestJS DI가 클래스를 토큰으로 쓰므로 별도 interface는 두지 않는다.
