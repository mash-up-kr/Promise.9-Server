import { parseInstagramCaption } from './instagram-caption.parser'

const page = (caption: string) => `vgp.seoul

서울 - Seoul

View profile

1,977 likes

vgp.seoul

${caption}

View all 48 comments

Add a comment...*Instagram*`

describe('parseInstagramCaption', () => {
    it.each([
        'travel\\_bonyoandlif\\_e\\_scape',
        'travel\\_bonyo and lif\\_e\\_scape',
        '서로 다른 표시 이름',
        'a'.repeat(61),
    ])('상단 표시 %s와 캡션 계정명이 달라도 본문을 추출한다', (header) => {
        // DdEfm89GVKh의 실제 응답 구조. 본문은 회귀 검증용으로 축약한다.
        const text = [
            header,
            '3,971 followers',
            'View profile',
            '3,877 likes',
            'travel\\_bonyo',
            '스케일 큰 방탈출 찾고있다면 저장해두세요‼️🔐',
            '@travel\\_bonyo #방탈출',
            'View all 1,795 comments',
            'Add a comment...*Instagram*',
        ].join('\n\n')
        expect(parseInstagramCaption(text)).toBe(
            '스케일 큰 방탈출 찾고있다면 저장해두세요‼️🔐\n\n@travel_bonyo #방탈출',
        )
    })

    it('캡션 작성자에 인증 배지가 있어도 상단 이름과 비교하지 않는다', () => {
        expect(
            parseInstagramCaption(
                page('캡션').replace(
                    '\nvgp.seoul\n',
                    '\nother_author*Verified*\n',
                ),
            ),
        ).toBe('캡션')
    })

    it('좋아요 다음에 계정명 없이 UI 문구가 나오면 거부한다', () => {
        expect(
            parseInstagramCaption(
                page('캡션').replace(
                    '\nvgp.seoul\n',
                    '\nView more on Instagram\n',
                ),
            ),
        ).toBeNull()
    })

    it('일반 게시물의 좋아요·버튼·작성자 문구를 제외한다', () => {
        expect(parseInstagramCaption(page('카페 소개\n\n주소와 #태그'))).toBe(
            '카페 소개\n\n주소와 #태그',
        )
    })

    it('인증 배지가 붙은 릴스의 긴 캡션과 단락을 보존한다', () => {
        const caption =
            '얼음 소개 🧊\n\n' + '본문 '.repeat(600).trimEnd() + '\n#Science'
        expect(
            parseInstagramCaption(
                page(caption)
                    .replace('vgp.seoul\n', 'vgp.seoul*Verified*\n')
                    .replace('서울 - Seoul', 'Original audio'),
            ),
        ).toBe(caption.trim())
    })

    it('음악 재생 버튼이 좋아요 앞에 들어가도 캡션만 추출한다', () => {
        expect(
            parseInstagramCaption(
                page('가방 소개').replace(
                    'View profile',
                    'View profile\n\n*Play*Watch on Instagram',
                ),
            ),
        ).toBe('가방 소개')
    })

    it('프로필 카드와 버튼이 추가되고 빈 줄이 없는 실제 응답 형식을 처리한다', () => {
        const text = [
            'lyssamariexo',
            'Gigi Perez · Sailor Song',
            'View profile',
            'Play',
            'Watch on Instagram',
            'lyssamariexo',
            '1,754 posts · 144K followers',
            'View more on Instagram',
            'Like',
            'Comment',
            'Share',
            'Save',
            '195 likes',
            'lyssamariexo',
            '추억을 남기는 여행 🥹💕',
            'ad //',
            '@example',
            '#여행',
            'View all 6 comments',
            'Add a comment...',
            'Instagram',
        ].join('\n')
        expect(parseInstagramCaption(text)).toBe(
            '추억을 남기는 여행 🥹💕\nad //\n@example\n#여행',
        )
    })

    it('캡션 안에 등장한 UI와 같은 문구는 삭제하지 않는다', () => {
        const caption =
            'View profile\n\n1,977 likes\nView all 48 comments\n\n내가 쓴 문구'
        expect(parseInstagramCaption(page(caption))).toBe(caption)
    })

    it('인용부호와 사용자 이름 및 해시태그를 유지한다', () => {
        const caption = '그는 “안녕”이라고 말했다.\n@friend #태그'
        expect(parseInstagramCaption(page(caption))).toBe(caption)
    })

    it('댓글 목록 링크가 없어도 캡션만 반환한다', () => {
        expect(
            parseInstagramCaption(
                page('캡션').replace('\n\nView all 48 comments', ''),
            ),
        ).toBe('캡션')
    })

    it('단수 like와 소수 약식 개수 표시를 처리한다', () => {
        for (const likes of [
            '1 like',
            '2.1K likes',
            'Be the first to like this',
        ]) {
            expect(
                parseInstagramCaption(
                    page('캡션').replace('1,977 likes', likes),
                ),
            ).toBe('캡션')
        }
    })

    it('Markdown으로 이스케이프된 계정명과 캡션을 처리한다', () => {
        const text = page('my\\_tag #여행').replace(
            /vgp\.seoul/g,
            'my\\_account',
        )
        expect(parseInstagramCaption(text)).toBe('my_tag #여행')
    })

    it('CRLF와 줄 끝 공백을 정리한다', () => {
        expect(
            parseInstagramCaption(
                page('캡션  \n\n본문').replace(/\n/g, '\r\n'),
            ),
        ).toBe('캡션\n\n본문')
    })

    it.each([
        null,
        '',
        page(''),
        page('캡션').replace('View profile', 'Unknown header'),
        page('캡션').replace('Add a comment...*Instagram*', 'Unknown footer'),
        'vgp.seoul\n서울 - Seoul\nView profile\nvgp.seoul\n778 posts · 24K followers\nLike\nComment\n1,977 likes\nAdd a comment...\nInstagram',
        'Sign up for Instagram to stay in the loop.\nView profile\n1,977 likes',
    ])('형식이 불명확하거나 캡션이 없으면 null을 반환한다', (text) => {
        expect(parseInstagramCaption(text)).toBeNull()
    })
})
