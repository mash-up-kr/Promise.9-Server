// 결합되지 않은 한글 자모. NFC 정규화 뒤에도 남아 있으면 모델 출력이 깨진 것이다.
const HANGUL_JAMO_PATTERN =
    /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/u

// 한국어 요약에 섞이면 안 되는 문자 체계. 한글, 라틴 문자, 숫자, 기호, 이모지는 허용한다.
const FOREIGN_SCRIPT_PATTERN =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Hebrew}\p{Script=Greek}]/u

export type KoreanTextIssue = 'BROKEN_HANGUL' | 'FOREIGN_SCRIPT'

export type KoreanTextCheck =
    | { ok: true; text: string }
    | { ok: false; text: string; issue: KoreanTextIssue; sample: string }

// 모델이 낸 한국어 텍스트를 NFC로 합치고, 깨진 자모나 다른 문자 체계가 남았는지 검사한다.
export function checkKoreanText(raw: string): KoreanTextCheck {
    const text = raw.normalize('NFC')

    const brokenHangul = text.match(HANGUL_JAMO_PATTERN)
    if (brokenHangul) {
        return {
            ok: false,
            text,
            issue: 'BROKEN_HANGUL',
            sample: sampleAround(text, brokenHangul.index ?? 0),
        }
    }

    const foreignScript = text.match(FOREIGN_SCRIPT_PATTERN)
    if (foreignScript) {
        return {
            ok: false,
            text,
            issue: 'FOREIGN_SCRIPT',
            sample: sampleAround(text, foreignScript.index ?? 0),
        }
    }

    return { ok: true, text }
}

// 로그에 남길 짧은 문맥. 문제 문자 앞뒤 몇 글자만 잘라 요약 전체를 노출하지 않는다.
function sampleAround(text: string, index: number): string {
    return text.slice(Math.max(0, index - 5), index + 6)
}
