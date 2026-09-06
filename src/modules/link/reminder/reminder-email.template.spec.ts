import { ReminderEmailData } from './reminder.type'
import {
    buildReminderBulkEmail,
    buildReminderTemplateData,
} from './reminder-email.template'

const reminder = (
    values: Partial<ReminderEmailData> = {},
): ReminderEmailData => ({
    recipientEmail: 'user@example.com',
    linkId: 42,
    title: '작은 팀에서 가볍게 시작하는 사용성 테스트',
    url: 'https://tistory.com/article?x=1&y=2',
    reminderAt: new Date('2026-08-29T01:50:00Z'),
    createdAt: new Date('2026-06-18T15:00:00Z'),
    folderName: '디자인',
    folderColor: '#d5d76a',
    memo: 'UT 준비할 때 참고하기',
    ...values,
})

describe('리마인드 이메일 템플릿', () => {
    it('CDN 설정 시 모든 CID를 버전별 HTTPS 이미지로 바꾸고 첨부를 생략한다', () => {
        const mail = buildReminderBulkEmail(
            [reminder()],
            'https://assets.example.com/email/reminder/v1/',
        )
        const data = mail.entries[0].templateData
        const html = mail.html!.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
            String(data[key]),
        )
        expect(html).not.toContain('cid:')
        expect(html).not.toContain('undefined')
        expect(html).toContain(
            'https://assets.example.com/email/reminder/v1/banner.png',
        )
        expect(html).toContain(
            'https://assets.example.com/email/reminder/v1/folder-light-9.png',
        )
        expect(html).toContain(
            'https://assets.example.com/email/reminder/v1/folder-dark-9.png',
        )
        expect(mail.attachments).toBeUndefined()
    })

    it('한국 시간의 예약·저장 날짜와 실제 상세 경로를 사용한다', () => {
        expect(buildReminderTemplateData(reminder())).toMatchObject({
            reminderDate: '2026년 8월 29일 오전 10:50',
            savedDate: '2026.06.19',
            detailUrl: 'https://link-ding-dong.com/link/42',
            folderColorIndex: 9,
            memoActionDisplay: 'none',
            folderLightBg: '#f4f5d0',
            folderDarkBg: '#36362d',
        })
        expect(
            buildReminderTemplateData(
                reminder({ reminderAt: new Date('2026-08-28T15:00:00Z') }),
            ).reminderDate,
        ).toBe('2026년 8월 29일 오전 12:00')
    })

    it('제목·메모·폴더명·URL은 HTML escape하고 일반 텍스트는 원문을 유지한다', () => {
        const input = reminder({
            title: '<img src=x onerror="x">',
            memo: '<script>alert(1)</script>\n두 번째 줄',
            folderName: '"<& 폴더',
        })
        const data = buildReminderTemplateData(input)
        expect(data.linkTitle).toBe('&lt;img src=x onerror=&quot;x&quot;&gt;')
        expect(data.memo).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;\n두 번째 줄',
        )
        expect(data.folderName).toBe('&quot;&lt;&amp; 폴더')
        expect(data.linkUrl).toContain('&amp;y=2')
        expect(data.memoText).toBe(input.memo)
        expect(data.linkTitleText).toBe(input.title)
    })

    it('메모가 없으면 안내와 작성 링크를 표시하고 미분류는 중립 색상을 쓴다', () => {
        const data = buildReminderTemplateData(
            reminder({ memo: ' \n ', folderName: null, folderColor: null }),
        )
        expect(data).toMatchObject({
            memoActionDisplay: 'inline-block',
            memoClass: 'empty-note',
            folderName: '미분류',
            folderColorIndex: 12,
        })
        expect(data.memo).toContain('아직 작성된 메모가 없어요.')
    })

    it('긴 폴더명과 도메인은 별도 줄로 배치한다', () => {
        expect(
            buildReminderTemplateData(
                reminder({ folderName: '디자인 리서치 - 사용성 테스트 UT' }),
            ).domainDisplay,
        ).toBe('block')
        expect(
            buildReminderTemplateData(
                reminder({ url: 'https://very-long-domain.example.com' }),
            ).domainDisplay,
        ).toBe('block')
    })

    it('모든 수신자의 치환 변수와 CID 이미지가 제공되고 개인정보는 공통값에 들어가지 않는다', () => {
        const mail = buildReminderBulkEmail([
            reminder(),
            reminder({
                linkId: 99,
                recipientEmail: 'other@example.com',
                folderColor: '#61a8ef',
                memo: null,
            }),
        ])
        expect(mail.templateData).toEqual({})
        for (const entry of mail.entries) {
            const render = (body: string) =>
                body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
                    expect(entry.templateData[key]).toBeDefined()
                    return String(entry.templateData[key])
                })
            const html = render(mail.html!)
            render(mail.text!)
            expect(html).not.toMatch(/\{\{\w+\}\}/)
            expect(html).not.toContain('<script')
            expect(html).not.toContain('href="#"')
            for (const [, cid] of html.matchAll(/cid:([\w-]+)/g)) {
                const attachment = mail.attachments?.find(
                    (a) => a.contentId === cid,
                )
                expect(attachment).toBeDefined()
                expect(
                    Buffer.from(attachment!.content)
                        .subarray(0, 8)
                        .toString('hex'),
                ).toBe('89504e470d0a1a0a')
            }
        }
        expect(mail.entries[0].templateData.detailUrl).toContain('/42')
        expect(mail.entries[1].templateData.detailUrl).toContain('/99')
        expect(new Set(mail.attachments?.map((a) => a.contentId)).size).toBe(
            mail.attachments?.length,
        )
    })

    it('실행 가능한 URL과 잘못된 링크 식별자를 거부한다', () => {
        expect(() =>
            buildReminderTemplateData(reminder({ url: 'javascript:alert(1)' })),
        ).toThrow()
        expect(() =>
            buildReminderTemplateData(reminder({ linkId: NaN })),
        ).toThrow()
    })
})
