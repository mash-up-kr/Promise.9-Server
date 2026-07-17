// 폴더 이름 최대 길이 (DB 컬럼 길이와 검증 스키마가 공유)
export const FOLDER_NAME_MAX_LENGTH = 255

// 사용자가 생성/수정할 수 없는 예약 폴더 이름
export const RESERVED_FOLDER_NAMES = ['미분류']

// 폴더 색상 hex 컬럼 길이 (#RRGGBB)
export const FOLDER_COLOR_LENGTH = 7

// 백엔드가 관리하는 폴더 색상 팔레트. 프론트는 GET /folders/colors로 이 목록을 받아 그대로 렌더하고,
// 폴더 생성/수정 시에는 이 목록에 있는 hex(소문자 기준)만 허용한다. 첫 번째 값(검정)이 기본색이다.
export const FOLDER_COLORS = [
    '#000000',
    '#61a8ef',
    '#859fc1',
    '#b282cc',
    '#ec5a29',
    '#50b094',
    '#81c7ba',
    '#ee97a4',
    '#e34647',
    '#8bd35f',
    '#d5d76a',
    '#f8d457',
    '#f1a23f',
] as const

export type FolderColor = (typeof FOLDER_COLORS)[number]

// color 미지정 시 사용할 기본 색상 (검정)
export const DEFAULT_FOLDER_COLOR: FolderColor = FOLDER_COLORS[0]

// 팔레트 검증용 조회 집합 (소문자 정규화된 hex 기준)
export const FOLDER_COLOR_SET: ReadonlySet<string> = new Set(FOLDER_COLORS)
