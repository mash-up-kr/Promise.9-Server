import { PushMessage } from '../../../infrastructure/push/push.type'

import {
    REMINDER_FALLBACK_LINK_TITLE,
    REMINDER_TITLE,
} from './reminder-email.template'

export function buildReminderPushMessage(
    to: string,
    reminder: { linkId: number; title: string | null },
): PushMessage {
    return {
        to,
        title: REMINDER_TITLE,
        body: reminder.title?.trim() || REMINDER_FALLBACK_LINK_TITLE,
        // 앱은 알림을 누르면 이 형식으로 링크 상세를 연다.
        data: { type: 'LINK_REMINDER', linkId: reminder.linkId },
        sound: 'default',
        priority: 'high',
        channelId: 'reminder',
    }
}
