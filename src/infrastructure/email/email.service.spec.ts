import { ConfigService } from '@nestjs/config'
import {
    SendBulkEmailCommand,
    SendBulkEmailCommandOutput,
    SendEmailCommand,
    SendEmailCommandOutput,
    SESv2Client,
} from '@aws-sdk/client-sesv2'

import { ValidatedEnvironment } from '../../config/environment'

import { EmailService } from './email.service'
import { EMAIL_ERROR } from './email-error.constant'

type EmailCommand = SendEmailCommand | SendBulkEmailCommand
type EmailCommandOutput = SendEmailCommandOutput | SendBulkEmailCommandOutput

class TestEmailService extends EmailService {
    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly sesClient: SESv2Client,
    ) {
        super(config)
    }

    protected override createClient() {
        return this.sesClient
    }
}

class InspectableEmailService extends EmailService {
    createSesClient(): SESv2Client {
        return super.createClient() as SESv2Client
    }
}

describe('EmailService', () => {
    let service: EmailService
    let sendMock: jest.Mock<Promise<EmailCommandOutput>, [EmailCommand]>

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
        sendMock = jest.fn<Promise<EmailCommandOutput>, [EmailCommand]>()
        service = new TestEmailService(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            { send: sendMock } as unknown as SESv2Client,
        )
    })

    it('SQS용 AWS 자격 증명 대신 SES 전용 자격 증명을 사용한다', async () => {
        const values: Record<string, string> = {
            EMAIL_SES_REGION: 'ap-northeast-2',
            EMAIL_SES_ACCESS_KEY_ID: 'ses-access-key-id',
            EMAIL_SES_SECRET_ACCESS_KEY: 'ses-secret-access-key',
            AWS_ACCESS_KEY_ID: 'sqs-access-key-id',
            AWS_SECRET_ACCESS_KEY: 'sqs-secret-access-key',
        }
        const config = {
            get: jest.fn((key: string) => values[key]),
        }
        const inspectableService = new InspectableEmailService(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
        )
        const client = inspectableService.createSesClient()

        await expect(client.config.credentials()).resolves.toMatchObject({
            accessKeyId: 'ses-access-key-id',
            secretAccessKey: 'ses-secret-access-key',
        })

        client.destroy()
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

    it('수신자별 주소와 치환값을 독립된 bulk 이메일로 변환한다', async () => {
        sendMock.mockResolvedValueOnce({
            BulkEmailEntryResults: [
                { Status: 'SUCCESS', MessageId: 'first-message-id' },
                {
                    Status: 'TRANSIENT_FAILURE',
                    Error: 'retry later',
                },
            ],
            $metadata: {},
        })

        const result = await service.sendBulk({
            entries: [
                {
                    to: 'first@example.com',
                    templateData: { linkTitle: '첫 번째 링크' },
                },
                {
                    to: 'second@example.com',
                    templateData: { linkTitle: '두 번째 링크' },
                },
            ],
            subject: '링크 리마인드',
            html: '<p>{{linkTitle}}</p>',
            templateData: { linkTitle: '저장한 링크' },
            tags: { kind: 'link-reminder' },
        })

        expect(result).toEqual([
            {
                Status: 'SUCCESS',
                MessageId: 'first-message-id',
            },
            {
                Status: 'TRANSIENT_FAILURE',
                Error: 'retry later',
            },
        ])
        const command = sendMock.mock.calls[0]?.[0]
        expect(command).toBeInstanceOf(SendBulkEmailCommand)
        expect(command?.input).toMatchObject({
            FromEmailAddress: 'reminder@link-ding-dong.com',
            DefaultContent: {
                Template: {
                    TemplateContent: {
                        Subject: '링크 리마인드',
                        Html: '<p>{{linkTitle}}</p>',
                    },
                    TemplateData: JSON.stringify({
                        linkTitle: '저장한 링크',
                    }),
                },
            },
            BulkEmailEntries: [
                {
                    Destination: {
                        ToAddresses: ['first@example.com'],
                    },
                    ReplacementEmailContent: {
                        ReplacementTemplate: {
                            ReplacementTemplateData: JSON.stringify({
                                linkTitle: '첫 번째 링크',
                            }),
                        },
                    },
                },
                {
                    Destination: {
                        ToAddresses: ['second@example.com'],
                    },
                },
            ],
            DefaultEmailTags: [{ Name: 'kind', Value: 'link-reminder' }],
            ConfigurationSetName: 'promise9-email',
        })
    })

    it('50개가 넘는 수신자를 SES 제한에 맞춰 나눠 발송한다', async () => {
        sendMock
            .mockResolvedValueOnce({
                BulkEmailEntryResults: Array.from(
                    { length: 50 },
                    (_, index) => ({
                        Status: 'SUCCESS',
                        MessageId: `message-${index}`,
                    }),
                ),
                $metadata: {},
            })
            .mockResolvedValueOnce({
                BulkEmailEntryResults: [
                    { Status: 'SUCCESS', MessageId: 'message-50' },
                ],
                $metadata: {},
            })

        const result = await service.sendBulk({
            entries: Array.from({ length: 51 }, (_, index) => ({
                to: `user-${index}@example.com`,
                templateData: { index },
            })),
            subject: '제목',
            text: '{{index}}',
        })

        expect(sendMock).toHaveBeenCalledTimes(2)
        const firstCommand = sendMock.mock.calls[0]?.[0]
        const secondCommand = sendMock.mock.calls[1]?.[0]

        expect(firstCommand).toBeInstanceOf(SendBulkEmailCommand)
        expect(secondCommand).toBeInstanceOf(SendBulkEmailCommand)
        expect(
            firstCommand instanceof SendBulkEmailCommand
                ? firstCommand.input.BulkEmailEntries
                : undefined,
        ).toHaveLength(50)
        expect(
            secondCommand instanceof SendBulkEmailCommand
                ? secondCommand.input.BulkEmailEntries
                : undefined,
        ).toHaveLength(1)
        expect(result).toHaveLength(51)
        expect(result.every((entry) => entry.Status === 'SUCCESS')).toBe(true)
    })

    it('한 bulk 요청이 실패해도 다음 묶음을 계속 발송한다', async () => {
        const sdkError = new Error('rate exceeded')
        sdkError.name = 'TooManyRequestsException'
        sendMock.mockRejectedValueOnce(sdkError).mockResolvedValueOnce({
            BulkEmailEntryResults: [
                { Status: 'SUCCESS', MessageId: 'last-message-id' },
            ],
            $metadata: {},
        })

        const result = await service.sendBulk({
            entries: Array.from({ length: 51 }, (_, index) => ({
                to: `user-${index}@example.com`,
                templateData: { index },
            })),
            subject: '제목',
            text: '{{index}}',
        })

        expect(sendMock).toHaveBeenCalledTimes(2)
        expect(result.slice(0, 50)).toEqual(
            Array.from({ length: 50 }, () => ({
                Status: 'FAILED',
                Error: 'TooManyRequestsException',
            })),
        )
        expect(result[50]).toEqual({
            Status: 'SUCCESS',
            MessageId: 'last-message-id',
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
