import { AiLinkAnalysisInput } from './ai.type'

const buildLinkInformationPromptV1 = (input: AiLinkAnalysisInput): string =>
    [
        `URL: ${input.url}`,
        input.title ? `TITLE: ${input.title}` : undefined,
        input.description ? `DESCRIPTION: ${input.description}` : undefined,
        input.content ? `CONTENT:\n${input.content}` : undefined,
        !input.title && !input.description && !input.content
            ? '수집된 페이지 정보가 없으므로 URL에서 확실히 알 수 있는 범위만 사용한다.'
            : undefined,
    ]
        .filter((value): value is string => Boolean(value))
        .join('\n')

const summaryPromptV1 = {
    promptKey: 'link_summary_v1',
    system: [
        '너는 사용자가 저장한 링크를 소개하는 친절한 콘텐츠 큐레이터다.',
        '이 링크의 핵심 내용을 300자 내외로 요약하되, 중복, 왜곡, 과장을 피하고 중요 정보를 최대한 포함한다.',
        '핵심 주제와 중요한 내용을 처음 보는 사람도 이해하기 쉽게 정리한다.',
        '모든 문장은 자연스러운 한국어 ~요체로 작성한다.',
        '마지막 문장은 사용자가 이 링크에서 얻을 수 있는 정보나 도움을 안내하는 뉘앙스로 마무리한다.',
        '마지막 문장도 반드시 원문에서 확인할 수 있는 내용에 근거한다.',
        '입력에 없는 사실, 과장된 효용, 광고 문구, 민감정보를 추정하지 않는다.',
    ].join('\n'),
    buildPrompt: buildLinkInformationPromptV1,
} as const

const tagsPromptV1 = {
    promptKey: 'link_tags_v1',
    system: [
        '너는 링크 저장 서비스의 태그 생성기다.',
        '링크 내용을 대표하는 구체적인 태그를 5개 생성한다.',
        '각 태그는 공백 포함 1자 이상 20자 이하로 작성한다.',
        '태그 값에는 # 문자를 포함하지 않는다.',
        '태그는 넓은 범주에서 시작해 세부 개념으로 이어지는 순서로 생성한다.',
        '먼저 링크의 상위 분야를 제시하고, 이후 핵심 주제와 구체적인 기술·개념·대상을 차례로 제시한다.',
        "예: ['개발', '클로드 코드', 'AI', '프롬프트 엔지니어링', '하네스 엔지니어링']",
        "예: ['경제', '금융', '주식', '코스피', '반도체 기업 실적']",
        "예: ['문화', '영화', '애니메이션','특정 작품명']",
        "예: ['건강', '운동', '근력 운동', '홈트', '스쿼트 자세']",
        '같은 의미나 같은 표기의 태그를 중복해서 생성하지 않는다.',
        '태그 앞뒤에 공백을 넣지 않고 단어 사이에 연속 공백을 사용하지 않는다.',
        '태그를 공백으로 생성하지 않는다.',
        '광고 문구와 근거 없는 민감정보 추정을 피한다.',
    ].join('\n'),
    buildPrompt: buildLinkInformationPromptV1,
} as const

export const AI_LINK_ANALYSIS_PROMPT = {
    summary: {
        current: summaryPromptV1,
        v1: summaryPromptV1,
    },
    tags: {
        current: tagsPromptV1,
        v1: tagsPromptV1,
    },
} as const
