import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
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
        app.setGlobalPrefix('api/v1')
        await app.init()
    })

    afterEach(async () => {
        await app?.close()
    })

    it('/api/v1 (GET)', () => {
        return request(app.getHttpServer())
            .get('/api/v1')
            .expect(200)
            .expect({ success: true, data: 'Hello World!' })
    })
})
