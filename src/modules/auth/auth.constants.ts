export const TOKEN_TYPE = {
    ACCESS: 'access',
    REFRESH: 'refresh',
} as const

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE]

// PRIMARY: 소셜 로그인으로 직접 발급된 토큰(웹/앱 공통).
// EXTENSION: PRIMARY 세션이 POST /auth/extension-token으로 위임 발급한 토큰.
// rotation(refresh) 중에도 이 값을 그대로 이어받아, EXTENSION 토큰이 refresh를
// 반복해 PRIMARY 권한을 얻는 걸 막는다.
export const TOKEN_PURPOSE = {
    PRIMARY: 'primary',
    EXTENSION: 'extension',
} as const

export type TokenPurpose = (typeof TOKEN_PURPOSE)[keyof typeof TOKEN_PURPOSE]
