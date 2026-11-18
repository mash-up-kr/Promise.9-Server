// 공유 토큰은 로그인 없이 폴더를 읽게 하는 값이라 로그에 남기지 않는다.
const SHARE_TOKEN_PATH = /(\/shared-folders\/)[^/?#]+/g

export function maskShareToken(url: string): string {
    return url.replace(SHARE_TOKEN_PATH, '$1***')
}
