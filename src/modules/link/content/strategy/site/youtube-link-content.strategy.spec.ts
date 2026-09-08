import { extractYoutubeVideoId } from './youtube-link-content.strategy'

describe('extractYoutubeVideoId', () => {
    it.each([
        'https://www.youtube.com/watch?v=8Pbt-Aum5Q4&t=10',
        'https://m.youtube.com/watch?v=8Pbt-Aum5Q4',
        'https://youtu.be/8Pbt-Aum5Q4?si=share',
        'https://youtube.com/shorts/8Pbt-Aum5Q4/',
        'https://youtube.com/embed/8Pbt-Aum5Q4',
        'https://youtube.com/live/8Pbt-Aum5Q4',
    ])('지원 URL에서 영상 ID를 추출한다: %s', (raw) => {
        expect(extractYoutubeVideoId(new URL(raw))).toBe('8Pbt-Aum5Q4')
    })

    it.each([
        'https://youtube.com.evil.example/watch?v=8Pbt-Aum5Q4',
        'https://youtu.be.evil.example/8Pbt-Aum5Q4',
        'https://youtube.com/playlist?list=8Pbt-Aum5Q4',
        'https://youtube.com/@channel',
        'https://youtube.com/watch',
        'https://youtube.com/watch?v=invalid',
        'https://youtu.be/8Pbt-Aum5Q4/extra',
        'https://youtube.com/shorts/8Pbt-Aum5Q4/extra',
        'https://youtube.com/watch?v=8Pbt%2CAum5Q4',
    ])('비영상·위장 호스트·잘못된 ID는 거부한다: %s', (raw) => {
        expect(extractYoutubeVideoId(new URL(raw))).toBeNull()
    })
})
