import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as request from 'supertest'
import { App } from 'supertest/types'

import { AppModule } from './../src/app.module'
import { CommonResponseInterceptor } from './../src/common/interceptor/response.interceptor'

describe('AppController (e2e)', () => {
    let app: INestApplication<App>

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile()

        app = moduleFixture.createNestApplication()
        app.useGlobalInterceptors(new CommonResponseInterceptor())
        await app.init()
    })

    it('/ (GET)', () => {
        return request(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect({ data: 'Hello World!' })
    })
})
