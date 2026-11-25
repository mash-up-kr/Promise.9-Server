// 실패한 채널은 첫 발송 시도 뒤 이 기간 안에서만 다시 보낸다. 지난 리마인드가 늦게 도착하지 않게 한다.
export const REMINDER_RETRY_WINDOW_MS = 60 * 60 * 1000

// Expo는 발송 약 15분 뒤 receipt 조회를 권장하고, receipt는 24시간 뒤 사라진다.
export const PUSH_RECEIPT_DELAY_MS = 15 * 60 * 1000
export const PUSH_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000

// 보내지 못한 것이 확실한 일시 오류만 다시 보낸다. 요청 실패(UNKNOWN)는 중복 발송될 수 있어 다시 보내지 않는다.
// NOT_SENT는 Expo에 요청하기 전 단계(소유자 확인)에서 실패한 서버 내부 코드다.
export const RETRYABLE_PUSH_ERRORS = ['MessageRateExceeded', 'NOT_SENT']
