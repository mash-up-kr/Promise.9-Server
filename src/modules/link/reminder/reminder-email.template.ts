import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { SendBulkEmailInput } from '../../../infrastructure/email/email.type'

import { ReminderEmailData } from './reminder.type'

const template = readFileSync(
    resolve(process.cwd(), 'email/link-reminder-email.html'),
    'utf8',
)
const poster = readFileSync(
    resolve(process.cwd(), 'email/assets/link-reminder-motion-poster.png'),
)

export function buildReminderBulkEmail(
    reminders: readonly ReminderEmailData[],
): SendBulkEmailInput {
    return {
        entries: reminders.map((reminder) => {
            const title = reminder.title?.trim() || '저장한 링크'

            return {
                to: reminder.recipientEmail,
                templateData: {
                    linkTitle: escapeHtml(title),
                    linkTitleText: title,
                    linkUrl: escapeHtml(reminder.url ?? '#'),
                    linkUrlText: reminder.url ?? '',
                },
            }
        }),
        subject: '저장해둔 링크 지금 볼까요?',
        text: '나중에 보려고 남겨둔 링크를 다시 꺼내왔어요.\n\n{{linkTitleText}}\n{{linkUrlText}}',
        html: template.replaceAll(
            '{{motionGifUrl}}',
            'cid:link-reminder-poster',
        ),
        templateData: {
            linkTitle: '저장한 링크',
            linkTitleText: '저장한 링크',
            linkUrl: '#',
            linkUrlText: '',
        },
        attachments: [
            {
                fileName: 'link-reminder-motion-poster.png',
                content: poster,
                contentType: 'image/png',
                disposition: 'inline',
                contentId: 'link-reminder-poster',
            },
        ],
        tags: { kind: 'link-reminder' },
    }
}

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[character]!,
    )
}
