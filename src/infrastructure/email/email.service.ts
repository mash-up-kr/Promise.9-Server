import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    AttachmentContentDisposition,
    SendEmailCommand,
    SendEmailCommandInput,
    SendEmailCommandOutput,
    SESv2Client,
} from '@aws-sdk/client-sesv2'

import { BaseException } from '../../common/exception/base.exception'
import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import { ValidatedEnvironment } from '../../config/environment'

import { EmailAttachment, SendEmailInput, SendEmailResult } from './email.type'
import { EMAIL_ERROR } from './email-error.constant'

const EMAIL_CHARSET = 'UTF-8'

interface SesClient {
    send(command: SendEmailCommand): Promise<SendEmailCommandOutput>
}

@Injectable()
export class EmailService {
    private client?: SesClient

    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    async send(input: SendEmailInput): Promise<SendEmailResult> {
        try {
            const response = await this.getClient().send(
                new SendEmailCommand(this.buildRequest(input)),
            )

            if (!response.MessageId) {
                throw new BaseException(EMAIL_ERROR.SEND_FAILED)
            }

            return { messageId: response.MessageId }
        } catch (error) {
            if (error instanceof BaseException) {
                throw error
            }

            throw new BaseException(EMAIL_ERROR.SEND_FAILED)
        }
    }

    protected createClient(): SesClient {
        const accessKeyId = this.config.get('AWS_ACCESS_KEY_ID', {
            infer: true,
        })
        const secretAccessKey = this.config.get('AWS_SECRET_ACCESS_KEY', {
            infer: true,
        })
        const sessionToken = this.config.get('AWS_SESSION_TOKEN', {
            infer: true,
        })

        return new SESv2Client({
            region: this.config.get('EMAIL_SES_REGION', { infer: true }),
            credentials:
                accessKeyId && secretAccessKey
                    ? { accessKeyId, secretAccessKey, sessionToken }
                    : undefined,
        })
    }

    private getClient() {
        this.client ??= this.createClient()

        return this.client
    }

    private buildRequest(input: SendEmailInput): SendEmailCommandInput {
        const fromEmailAddress = this.config.get('EMAIL_FROM_ADDRESS', {
            infer: true,
        })

        if (!fromEmailAddress) {
            throw new BaseException(COMMON_ERROR.INTERNAL_SERVER_ERROR)
        }

        return {
            FromEmailAddress: fromEmailAddress,
            Destination: {
                ToAddresses: [input.to],
            },
            ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
            Content: {
                Simple: {
                    Subject: {
                        Data: input.subject,
                        Charset: EMAIL_CHARSET,
                    },
                    Body: {
                        Html: input.html
                            ? { Data: input.html, Charset: EMAIL_CHARSET }
                            : undefined,
                        Text: input.text
                            ? { Data: input.text, Charset: EMAIL_CHARSET }
                            : undefined,
                    },
                    Attachments: input.attachments?.map((attachment) =>
                        this.buildAttachment(attachment),
                    ),
                },
            },
            EmailTags: input.tags
                ? Object.entries(input.tags).map(([Name, Value]) => ({
                      Name,
                      Value,
                  }))
                : undefined,
            ConfigurationSetName: this.config.get('EMAIL_CONFIGURATION_SET', {
                infer: true,
            }),
        }
    }

    private buildAttachment(attachment: EmailAttachment) {
        return {
            RawContent: attachment.content,
            FileName: attachment.fileName,
            ContentType: attachment.contentType,
            ContentDisposition:
                attachment.disposition === 'inline'
                    ? AttachmentContentDisposition.INLINE
                    : AttachmentContentDisposition.ATTACHMENT,
            ContentId: attachment.contentId,
            ContentDescription: attachment.description,
        }
    }
}
