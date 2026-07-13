import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

const GITHUB_API_DOCS_BASE_URL =
    'https://github.com/mash-up-kr/Promise.9-Server/blob/main/docs/api'

const SWAGGER_CUSTOM_CSS = `
.swagger-ui .renderedMarkdown code {
    padding: 0 3px;
    border: 0;
    border-radius: 3px;
    background: rgba(127, 127, 127, 0.12) !important;
    color: inherit !important;
    font-weight: 500;
    line-height: inherit;
    vertical-align: baseline;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.swagger-ui .model .property-row td {
    padding-top: 4px;
    padding-bottom: 4px;
    line-height: 1.5;
    vertical-align: top;
}

.swagger-ui .model .property-row .prop,
.swagger-ui .model .property-row .renderedMarkdown p {
    line-height: 1.5;
}

.swagger-ui .model .property-row .renderedMarkdown {
    margin-top: 4px;
}
`

export function swaggerConfig(app: INestApplication) {
    const config = new DocumentBuilder()
        .setTitle('Promise.9 API')
        .setDescription('Mash-Up Promise.9팀 API 문서입니다.')
        .setExternalDoc(
            'GitHub에서 전체 API 명세 보기',
            `${GITHUB_API_DOCS_BASE_URL}/api-spec.md`,
        )
        .addTag('App', '서버의 기본 응답을 확인하는 Endpoint입니다.', {
            description: 'GitHub에서 전체 API 명세 보기',
            url: `${GITHUB_API_DOCS_BASE_URL}/api-spec.md`,
        })
        .addTag(
            'Auth',
            '소셜 로그인, Access Token 재발급, 로그아웃 및 회원 탈퇴를 담당합니다.',
            {
                description: 'GitHub에서 인증 API 상세 명세 보기',
                url: `${GITHUB_API_DOCS_BASE_URL}/auth.md`,
            },
        )
        .addTag('User', '인증된 사용자의 계정 정보를 조회합니다.', {
            description: 'GitHub에서 사용자 API 상세 명세 보기',
            url: `${GITHUB_API_DOCS_BASE_URL}/user.md`,
        })
        .addTag(
            'Link',
            '링크 목록 조회, 저장, 상세 조회, 수정, 삭제·복구, 조회 기록 및 사용자 태그 관리를 담당합니다.',
            {
                description: 'GitHub에서 링크 API 상세 명세 보기',
                url: `${GITHUB_API_DOCS_BASE_URL}/link.md`,
            },
        )
        .addTag(
            'Folder',
            '링크 상태별 카운트와 사용자 폴더 목록을 조회하고, 실제 folders row를 생성·수정·삭제합니다.',
            {
                description: 'GitHub에서 폴더 API 상세 명세 보기',
                url: `${GITHUB_API_DOCS_BASE_URL}/folder.md`,
            },
        )
        .addBearerAuth()
        .build()

    const document = () => SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api-docs', app, document, {
        explorer: true,
        customCss: SWAGGER_CUSTOM_CSS,
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            operationsSorter: 'method',
            defaultModelExpandDepth: 3,
        },
    })
}
