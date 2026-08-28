import { Controller, Get, INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'

import { ApiListRecommendations } from './recommendation.swagger'

@Controller('recommendations')
class RecommendationSwaggerTestController {
    @Get()
    @ApiListRecommendations()
    list() {}
}

describe('recommendation Swagger', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [RecommendationSwaggerTestController],
        }).compile()

        app = moduleRef.createNestApplication()
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    it('목록과 null을 모두 허용하는 성공 응답 schema를 생성한다', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().build(),
        )
        const response =
            document.paths['/recommendations']?.get?.responses?.['200']

        expect(response).toMatchObject({
            content: {
                'application/json': {
                    schema: {
                        properties: {
                            data: {
                                oneOf: [
                                    {
                                        $ref: '#/components/schemas/RecommendationResponseDto',
                                    },
                                    {
                                        type: 'object',
                                        nullable: true,
                                        enum: [null],
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        })
    })
})
