import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export function swaggerConfig(app: INestApplication) {
    const config = new DocumentBuilder()
        .setTitle('Promise.9 API')
        .setDescription('Mash-Up Promise.9팀 API 문서입니다.')
        .build()

    const document = () => SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api-docs', app, document, {
        explorer: true,
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            operationsSorter: 'method',
        },
    })
}
