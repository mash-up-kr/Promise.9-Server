import { ConfigService } from '@nestjs/config'
import { SendEmailCommand, SendEmailCommandOutput } from '@aws-sdk/client-sesv2'

import { ValidatedEnvironment } from '../../config/environment'

import { EmailService } from './email.service'
import { EMAIL_ERROR } from './email-error.constant'

interface SesClientMock {
    send(command: SendEmailCommand): Promise<SendEmailCommandOutput>
}

class TestEmailService extends EmailService {
    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly sesClient: SesClientMock,
    ) {
        super(config)
    }

    protected override createClient() {
        return this.sesClient
    }
}

describe('EmailService', () => {
    let service: EmailService
    let sendMock: jest.Mock<
        Promise<SendEmailCommandOutput>,
        [command: SendEmailCommand]
    >

    beforeEach(() => {
        const config = {
            get: jest.fn((key: string) => {
                const values: Record<string, string> = {
                    EMAIL_SES_REGION: 'ap-northeast-2',
                    EMAIL_FROM_ADDRESS: 'reminder@link-ding-dong.com',
                    EMAIL_CONFIGURATION_SET: 'promise9-email',
                }

                return values[key]
            }),
        }
        sendMock = jest.fn<
            Promise<SendEmailCommandOutput>,
            [command: SendEmailCommand]
        >()
        service = new TestEmailService(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            { send: sendMock },
        )
    })

    it('수신자 한 명의 이메일을 SES 요청으로 변환한다', async () => {
        sendMock.mockResolvedValueOnce({
            MessageId: 'ses-message-id',
            $metadata: {},
        })

        const result = await service.send({
            to: 'user@example.com',
            subject: '링크 리마인드',
            html: '<img src="cid:link-reminder-poster">',
            text: '저장한 링크를 확인해보세요.',
            attachments: [
                {
                    fileName: 'poster.png',
                    content: new Uint8Array([1, 2, 3]),
                    contentType: 'image/png',
                    disposition: 'inline',
                    contentId: 'link-reminder-poster',
                },
            ],
            tags: { kind: 'link-reminder' },
        })

        expect(result).toEqual({ messageId: 'ses-message-id' })
        const command = sendMock.mock.calls[0]?.[0]
        expect(command).toBeInstanceOf(SendEmailCommand)
        expect(command?.input).toMatchObject({
            FromEmailAddress: 'reminder@link-ding-dong.com',
            Destination: {
                ToAddresses: ['user@example.com'],
            },
            Content: {
                Simple: {
                    Attachments: [
                        {
                            FileName: 'poster.png',
                            ContentDisposition: 'INLINE',
                            ContentId: 'link-reminder-poster',
                        },
                    ],
                },
            },
            EmailTags: [{ Name: 'kind', Value: 'link-reminder' }],
            ConfigurationSetName: 'promise9-email',
        })
    })

    it('SES 오류를 이메일 발송 실패 예외로 변환한다', async () => {
        const sdkError = new Error('request failed')
        sendMock.mockRejectedValueOnce(sdkError)

        const result = service.send({
            to: 'user@example.com',
            subject: '제목',
            text: '본문',
        })

        await expect(result).rejects.toMatchObject({
            status: EMAIL_ERROR.SEND_FAILED.code,
            response: {
                error: {
                    errorCode: EMAIL_ERROR.SEND_FAILED.errorCode,
                    message: EMAIL_ERROR.SEND_FAILED.message,
                },
            },
        })
    })

    it('message ID가 없는 응답을 이메일 발송 실패로 처리한다', async () => {
        sendMock.mockResolvedValueOnce({ $metadata: {} })

        const result = service.send({
            to: 'user@example.com',
            subject: '제목',
            text: '본문',
        })

        await expect(result).rejects.toMatchObject({
            status: EMAIL_ERROR.SEND_FAILED.code,
            response: {
                error: {
                    errorCode: EMAIL_ERROR.SEND_FAILED.errorCode,
                },
            },
        })
    })
})
