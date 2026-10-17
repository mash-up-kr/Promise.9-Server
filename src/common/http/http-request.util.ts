import type { Request } from 'express'

export function isHealthCheck(
    method: string | undefined,
    path: string,
): boolean {
    return (
        (method === 'GET' || method === 'HEAD') &&
        /^\/api\/v1\/?$/.test(path.split('?')[0])
    )
}

// Nest의 global prefix를 포함한 등록 경로만 사용한다. 404에서도 raw URL은 남기지 않는다.
export function getRequestRoute(request: Request): string {
    const route = request.route as { path?: unknown } | undefined
    return typeof route?.path === 'string' ? route.path : 'unmatched'
}
