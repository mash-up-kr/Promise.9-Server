import { Injectable, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

import { ValidationException } from '../exception/validation.exception'

// Zod 스키마로 요청 body/query를 검증하고, 실패 시 공통 에러 포맷(400)으로 변환한다.
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value)

        if (result.success) {
            return result.data
        }

        const message = result.error.issues
            .map(
                (issue) =>
                    `${issue.path.join('.') || 'value'}: ${issue.message}`,
            )
            .join(', ')

        throw new ValidationException(message)
    }
}
