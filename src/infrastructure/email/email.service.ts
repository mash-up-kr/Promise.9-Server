import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    AttachmentContentDisposition,
    BulkEmailEntryResult,
    SendBulkEmailCommand,
    SendBulkEmailCommandInput,
    SendBulkEmailCommandOutput,
    SendEmailCommand,
    SendEmailCommandInput,
    SendEmailCommandOutput,
    SESv2Client,
} from '@aws-sdk/client-sesv2'

import { BaseException } from '../../common/exception/base.exception'
import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import { ValidatedEnvironment } from '../../config/environment'

import {
    EmailAttachment,
    SendBulkEmailEntry,
    SendBulkEmailInput,
    SendEmailInput,
    SendEmailResult,
} from './email.type'
import { EMAIL_ERROR } from './email-error.constant'

const EMAIL_CHARSET = 'UTF-8'
const SES_BULK_DESTINATION_LIMIT = 50

interface EmailClient {
    send(command: SendEmailCommand): Promise<SendEmailCommandOutput>
    send(command: SendBulkEmailCommand): Promise<SendBulkEmailCommandOutput>
}

@Injectable()
export class EmailService {
    private client?: EmailClient

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

    async sendBulk(input: SendBulkEmailInput): Promise<BulkEmailEntryResult[]> {
        const results: BulkEmailEntryResult[] = []

        for (
            let offset = 0;
            offset < input.entries.length;
            offset += SES_BULK_DESTINATION_LIMIT
        ) {
            const entries = input.entries.slice(
                offset,
                offset + SES_BULK_DESTINATION_LIMIT,
            )

            try {
                const response = await this.getClient().send(
                    new SendBulkEmailCommand(
                        this.buildBulkRequest(input, entries),
                    ),
                )

                results.push(
                    ...entries.map(
                        (_, index) =>
                            response.BulkEmailEntryResults?.[index] ?? {
                                Status: 'FAILED' as const,
                            },
                    ),
                )
            } catch (error) {
                const status = error instanceof Error ? error.name : 'FAILED'

                results.push(
                    ...entries.map(() => ({
                        Status: 'FAILED' as const,
                        Error: status,
                    })),
                )
            }
        }

        return results
    }

    protected createClient(): EmailClient {
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
        return {
            FromEmailAddress: this.getFromEmailAddress(),
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

    private buildBulkRequest(
        input: SendBulkEmailInput,
        entries: readonly SendBulkEmailEntry[],
    ): SendBulkEmailCommandInput {
        const fromEmailAddress = this.getFromEmailAddress()

        return {
            FromEmailAddress: fromEmailAddress,
            ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
            DefaultContent: {
                Template: {
                    TemplateContent: {
                        Subject: input.subject,
                        Html: input.html,
                        Text: input.text,
                    },
                    TemplateData: JSON.stringify(input.templateData ?? {}),
                    Attachments: input.attachments?.map((attachment) =>
                        this.buildAttachment(attachment),
                    ),
                },
            },
            BulkEmailEntries: entries.map((entry) => ({
                Destination: {
                    ToAddresses: [entry.to],
                },
                ReplacementEmailContent: {
                    ReplacementTemplate: {
                        ReplacementTemplateData: JSON.stringify(
                            entry.templateData,
                        ),
                    },
                },
                ReplacementTags: entry.tags
                    ? Object.entries(entry.tags).map(([Name, Value]) => ({
                          Name,
                          Value,
                      }))
                    : undefined,
            })),
            DefaultEmailTags: input.tags
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

    private getFromEmailAddress(): string {
        const fromEmailAddress = this.config.get('EMAIL_FROM_ADDRESS', {
            infer: true,
        })

        if (!fromEmailAddress) {
            throw new BaseException(COMMON_ERROR.INTERNAL_SERVER_ERROR)
        }

        return fromEmailAddress
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
