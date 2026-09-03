import { BaseException } from '../exception/base.exception'

import { AuthUser } from './jwt-auth.guard'
import { PrimaryAuthGuard } from './primary-auth.guard'

// extension-token 재귀 발급/MASTER_ACCESS_TOKEN 우회 차단(P1)의 핵심 로직.
describe('PrimaryAuthGuard', () => {
    let guard: PrimaryAuthGuard

    beforeEach(() => {
        guard = new PrimaryAuthGuard()
    })

    it('purpose가 primary인 사용자는 통과시킨다', () => {
        const user: AuthUser = { userId: 1, purpose: 'primary' }
        expect(guard.handleRequest(null, user)).toBe(user)
    })

    it('purpose가 extension인 사용자는 거부한다', () => {
        const user: AuthUser = { userId: 1, purpose: 'extension' }
        expect(() => guard.handleRequest(null, user)).toThrow(BaseException)
    })

    it('purpose가 없는 사용자(MASTER_ACCESS_TOKEN 우회)는 거부한다', () => {
        const user: AuthUser = { userId: 1 }
        expect(() => guard.handleRequest(null, user)).toThrow(BaseException)
    })

    it('passport 검증에 실패하면 거부한다', () => {
        expect(() => guard.handleRequest(new Error('fail'), false)).toThrow(
            BaseException,
        )
    })
})
