import { checkKoreanText } from './ai-link-analysis.language'

describe('checkKoreanText', () => {
    it('한국어, 영어, 숫자, 기호, 이모지만 있으면 통과한다', () => {
        const text =
            '이 게시물은 NestJS 11과 Drizzle ORM으로 API를 만드는 방법을 소개해요. 📚 (2026년 기준)'

        expect(checkKoreanText(text)).toEqual({ ok: true, text })
    })

    it('분해된 자모는 NFC로 합쳐서 통과시킨다', () => {
        const decomposed = '게시물'.normalize('NFD')

        expect(checkKoreanText(decomposed)).toEqual({
            ok: true,
            text: '게시물',
        })
    })

    it('결합되지 않은 한글 자모가 남아 있으면 깨진 출력으로 본다', () => {
        const result = checkKoreanText('이 딲ᄌᄂ은 디자이너를 위한 글이에요.')

        expect(result).toMatchObject({ ok: false, issue: 'BROKEN_HANGUL' })
        expect(result).not.toHaveProperty('sample', '')
    })

    it.each([
        ['한자', '이 글은 美 증시 흐름을 설명해요.'],
        ['일본어', 'この記事는 도쿄 여행 팁을 소개해요.'],
        ['키릴 문자', 'Москва 여행 정보를 정리한 글이에요.'],
    ])('%s가 섞이면 다른 문자 체계로 본다', (_label, text) => {
        expect(checkKoreanText(text)).toMatchObject({
            ok: false,
            issue: 'FOREIGN_SCRIPT',
        })
    })

    it('문제 문자 주변만 sample로 남긴다', () => {
        expect(
            checkKoreanText('앞부분 문장입니다 漢字 뒷부분 문장입니다'),
        ).toEqual({
            ok: false,
            text: '앞부분 문장입니다 漢字 뒷부분 문장입니다',
            issue: 'FOREIGN_SCRIPT',
            sample: '장입니다 漢字 뒷부분',
        })
    })
})
