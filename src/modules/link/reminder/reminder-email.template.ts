import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    EmailAttachment,
    SendBulkEmailInput,
} from '../../../infrastructure/email/email.type'

import { ReminderEmailData } from './reminder.type'

const emailRoot = resolve(process.cwd(), 'email')
const template = readFileSync(
    resolve(emailRoot, 'link-reminder-email.html'),
    'utf8',
)
const folderColors = JSON.parse(
    readFileSync(resolve(emailRoot, 'reminder-folder-colors.json'), 'utf8'),
) as Array<{
    color: string
    lightBg: string
    lightText: string
    darkBg: string
    darkText: string
}>
const commonAssets = [
    'banner',
    'logo-light',
    'logo-dark',
    'bell',
    'star-light',
    'star-dark',
    'arrow-light',
    'arrow-dark',
    'chevron-light',
    'chevron-dark',
    'source',
    'ai',
]
const attachmentCache = new Map<string, EmailAttachment>()
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
})

export function buildReminderBulkEmail(
    reminders: readonly ReminderEmailData[],
    assetBaseUrl?: string,
): SendBulkEmailInput {
    const assets = new Set(commonAssets)
    const entries = reminders.map((reminder) => {
        const data = buildReminderTemplateData(reminder)
        assets.add(`folder-light-${data.folderColorIndex}`)
        assets.add(`folder-dark-${data.folderColorIndex}`)
        return { to: reminder.recipientEmail, templateData: data }
    })

    return {
        entries,
        subject: '저장해둔 링크 지금 볼까요?',
        replyTo: 'promise.9@gmail.com',
        text: '{{reminderDate}}\n{{linkTitleText}}\n{{linkUrlText}}\n\n폴더: {{folderNameText}} · {{savedDate}} 저장\n나의 메모: {{memoText}}\n\n링띵동에서 보기 / AI 요약 함께 보기: {{detailUrlText}}\n\n이 메일은 저장하신 링크의 리마인드 날짜가 되어 보내드렸어요.\n문의: promise.9@gmail.com',
        html: assetBaseUrl
            ? template.replace(
                  /cid:reminder-([\w{}-]+)/g,
                  (_, name: string) =>
                      `${escapeHtml(assetBaseUrl.replace(/\/$/, ''))}/${name}.png`,
              )
            : template,
        // 모든 수신자가 전체 치환값을 제공한다. 사용자 정보는 공통 기본값에 넣지 않는다.
        templateData: {},
        attachments: assetBaseUrl
            ? undefined
            : Array.from(assets, getAttachment),
        tags: { kind: 'link-reminder' },
    }
}

export function buildReminderTemplateData(reminder: ReminderEmailData) {
    const title = reminder.title?.trim() || '저장한 링크'
    const url = new URL(reminder.url)
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('리마인드 URL은 http 또는 https만 사용할 수 있습니다.')
    if (!Number.isSafeInteger(reminder.linkId) || reminder.linkId <= 0)
        throw new Error('리마인드 linkId가 올바르지 않습니다.')
    const detailUrl = `https://link-ding-dong.com/link/${reminder.linkId}`
    const folderName = reminder.folderName || '미분류'
    const index = folderColors.findIndex(
        (color) => color.color === reminder.folderColor?.toLowerCase(),
    )
    const folderColorIndex = index < 0 ? folderColors.length - 1 : index
    const colors = folderColors[folderColorIndex]
    const memo = reminder.memo?.trim() ? reminder.memo : ''
    const memoText =
        memo ||
        '아직 작성된 메모가 없어요. 저장한 이유나 기억하고 싶은 점을 적어보세요.'
    const scheduled = dateParts(reminder.reminderAt)
    const saved = dateParts(reminder.createdAt)
    const hour = Number(scheduled.hour)
    // 긴 도메인/폴더명은 고정 폭 버튼과 겹치지 않도록 다음 줄에 배치한다.
    const stackedDomain = folderName.length > 4 || url.hostname.length > 12

    return {
        linkTitle: escapeHtml(title),
        linkTitleText: title,
        linkUrl: escapeHtml(url.toString()),
        linkUrlText: url.toString(),
        detailUrl: escapeHtml(detailUrl),
        detailUrlText: detailUrl,
        reminderDate: `${scheduled.year}년 ${Number(scheduled.month)}월 ${Number(scheduled.day)}일 ${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${scheduled.minute}`,
        savedDate: `${saved.year}.${saved.month}.${saved.day}`,
        copyrightYear: scheduled.year,
        folderName: escapeHtml(folderName),
        folderNameText: folderName,
        folderColorIndex,
        folderLightBg: colors.lightBg,
        folderLightText: colors.lightText,
        folderDarkBg: colors.darkBg,
        folderDarkText: colors.darkText,
        domain: escapeHtml(url.hostname),
        domainDisplay: stackedDomain ? 'block' : 'inline',
        domainMargin: stackedDomain ? 4 : 0,
        memo: escapeHtml(memoText),
        memoText,
        memoClass: memo ? 'primary-text' : 'empty-note',
        memoColor: memo ? '#1a1a1a' : '#8a8a93',
        memoActionDisplay: memo ? 'none' : 'inline-block',
    }
}

function dateParts(date: Date): Record<string, string> {
    return Object.fromEntries(
        dateFormatter
            .formatToParts(date)
            .map(({ type, value }) => [type, value]),
    )
}

function getAttachment(name: string): EmailAttachment {
    let attachment = attachmentCache.get(name)
    if (!attachment) {
        attachment = {
            fileName: `${name}.png`,
            content: readFileSync(
                resolve(emailRoot, 'assets/reminder', `${name}.png`),
            ),
            contentType: 'image/png',
            disposition: 'inline',
            contentId: `reminder-${name}`,
        }
        attachmentCache.set(name, attachment)
    }
    return attachment
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
