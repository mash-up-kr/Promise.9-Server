import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common'
import { map, Observable } from 'rxjs'

import { CommonResponse } from '../dto/common-response.dto'

@Injectable()
export class CommonResponseInterceptor<T> implements NestInterceptor<
    T,
    CommonResponse<T>
> {
    intercept(
        _context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<CommonResponse<T>> {
        return next.handle().pipe(
            map((data) => {
                return {
                    success: true,
                    data: data,
                }
            }),
        )
    }
}
