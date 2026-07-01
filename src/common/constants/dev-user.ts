// 인증 가드 도입 전까지 사용하는 임시 고정 사용자 ID.
// 추후 JWT 가드 + @CurrentUser() 도입 시 컨트롤러에서 이 상수 대신 실제 userId를 주입한다.
export const DEV_USER_ID = 1
