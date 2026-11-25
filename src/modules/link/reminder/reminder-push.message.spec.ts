import { buildReminderPushMessage } from './reminder-push.message'

describe('buildReminderPushMessage', () => {
    it('링크 제목을 본문으로, 링크 ID를 data로 담아 리마인드 채널에 바로 표시되게 보낸다', () => {
        expect(
            buildReminderPushMessage('ExponentPushToken[device]', {
                linkId: 42,
                title: ' 읽어볼 링크 ',
            }),
        ).toEqual({
            to: 'ExponentPushToken[device]',
            title: '저장해둔 링크 지금 볼까요?',
            body: '읽어볼 링크',
            data: { type: 'LINK_REMINDER', linkId: 42 },
            sound: 'default',
            priority: 'high',
            channelId: 'reminder',
        })
    })

    it.each([null, '', '   '])(
        '링크 제목이 없으면(%p) 이메일과 같은 기본 제목을 쓴다',
        (title) => {
            expect(
                buildReminderPushMessage('ExponentPushToken[device]', {
                    linkId: 42,
                    title,
                }).body,
            ).toBe('저장한 링크')
        },
    )
})
