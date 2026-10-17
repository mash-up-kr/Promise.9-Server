import { sanitizeLogValue, sanitizeText } from './redaction'

describe('로그 민감정보 처리', () => {
    it('URL 인증정보와 쿼리를 제거하고 오류 종류와 호출 위치를 남긴다', () => {
        const error = new Error(
            'fetch https://user:password@example.test/path?api_key=secret#fragment failed',
        )
        const result = sanitizeLogValue(error)
        expect(result).toMatchObject({
            type: 'Error',
            message: 'fetch https://example.test/path failed',
        })
        expect((result as { stack: string }).stack).toContain(
            'redaction.spec.ts',
        )
        expect(JSON.stringify(result)).not.toMatch(/password|secret|fragment/)
    })

    it('중첩 필드, 순환 객체, BigInt를 JSON으로 안전하게 출력한다', () => {
        const record = {
            user: {
                email: 'mail@example.test',
                accessToken: 'private',
                id: 123n,
            },
            body: { data: 'private' },
            reference: {},
        }
        record.reference = record
        expect(sanitizeLogValue(record)).toEqual({
            user: { email: '[REDACTED]', accessToken: '[REDACTED]', id: '123' },
            body: '[REDACTED]',
            reference: '[Circular]',
        })
    })

    it('기존 문자열 로그의 토큰·이메일·상대 URL도 가린다', () => {
        const text =
            'Cannot GET /callback?code=private Authorization: Bearer private mail@example.test {"access_token":"private"}'
        expect(sanitizeText(text)).not.toMatch(/private|mail@example/)
    })

    it('Drizzle 오류에서 쿼리와 파라미터를 제거하지만 스택은 보존한다', () => {
        expect(
            sanitizeText(
                'Failed query: select private\nparams: sensitive\n    at query (db.ts:3:1)',
            ),
        ).toBe('Failed query: [REDACTED]\n    at query (db.ts:3:1)')
    })
})
