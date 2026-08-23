export type EmailAttachmentDisposition = 'attachment' | 'inline'

type EmailAttachmentBase = {
    fileName: string
    content: Uint8Array
    contentType: string
    description?: string
}

export type EmailAttachment = EmailAttachmentBase &
    (
        | {
              disposition: 'inline'
              contentId: string
          }
        | {
              disposition?: 'attachment'
              contentId?: never
          }
    )

type EmailBody =
    | {
          html: string
          text?: string
      }
    | {
          html?: string
          text: string
      }

export type SendEmailInput = EmailBody & {
    to: string
    replyTo?: string
    subject: string
    attachments?: readonly EmailAttachment[]
    tags?: Readonly<Record<string, string>>
}

export type SendEmailResult = {
    messageId: string
}
