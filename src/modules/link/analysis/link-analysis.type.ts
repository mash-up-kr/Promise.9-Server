// 저장된 링크의 비동기 분석을 시작할 때 필요한 식별자와 원문 URL.
export type LinkAnalysisInput = {
    linkId: number
    userId: number
    url: string
}

// 링크 분석의 최소 재시도 단위. 실패한 작업만 다시 실행해 AI 중복 호출을 막는다.
// CONTENT는 크롤링과 title·description 저장, EMBEDDING은 검색용 벡터 생성을 담당한다.
export const LINK_ANALYSIS_TASKS = [
    'CONTENT',
    'SUMMARY',
    'TAGS',
    'EMBEDDING',
] as const

export type LinkAnalysisTask = (typeof LINK_ANALYSIS_TASKS)[number]

// SUMMARY·TAGS는 CONTENT 결과를 입력으로 쓰므로 단독 재시도 시 크롤링을 다시 실행한다.
export const LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS = [
    'SUMMARY',
    'TAGS',
] as const

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

// 재시도 메시지 포맷. 인라인 실행이 실패한 작업만 tasks에 담아 발행한다.
export const LINK_ANALYSIS_MESSAGE_VERSION = 2 as const

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

// 인라인 실행과 SQS 재시도가 공유하는 단일 실행 지점.
// 요청한 작업을 각각 독립 실행하고, 예외를 던지지 않고 작업별 결과를 반환한다.
export interface LinkAnalysisRunner {
    run(
        input: LinkAnalysisInput,
        tasks: readonly LinkAnalysisTask[],
    ): Promise<LinkAnalysisTaskResult[]>
}

// 재시도 메시지 발행 지점.
export interface LinkAnalysisRetryQueue {
    publishRetry(message: LinkAnalysisRetryMessage): Promise<void>
}

// 인라인 우선 실행과 실패 작업의 큐 위임을 조율한다.
export interface LinkAnalysisDispatcher {
    // 링크 저장 응답을 막지 않는 fire-and-forget 진입점.
    // 전체 작업을 인라인 실행하고, RETRYABLE 실패만 재시도 큐로 넘긴다.
    dispatch(input: LinkAnalysisInput): void

    // consumer 진입점. 메시지에 담긴 작업만 실행한다.
    // RETRYABLE 실패가 남으면 예외를 던져 visibility timeout 이후 재전달을 받고,
    // 전부 성공이거나 PERMANENT 실패만 남으면 정상 종료해 메시지를 삭제하게 한다.
    handleRetry(message: LinkAnalysisRetryMessage): Promise<void>
}
