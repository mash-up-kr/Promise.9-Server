import type { Mock } from 'bun:test'

type AnyFunction = (...args: any[]) => any

export type BunMock = Mock<AnyFunction>

export type BunMocked<T> = {
    [Key in keyof T]: T[Key] extends AnyFunction ? Mock<T[Key]> : T[Key]
}
