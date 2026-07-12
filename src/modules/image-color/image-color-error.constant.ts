import { HttpStatus } from '@nestjs/common'

export const IMAGE_COLOR_ERROR = {
    ANALYSIS_FAILED: {
        code: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: 940001,
        message: '이미지 색상을 추출할 수 없습니다.',
    },
    PALETTE_ANALYSIS_FAILED: {
        code: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: 940001,
        message: '이미지 색상 팔레트를 추출할 수 없습니다.',
    },
    SHARP_ANALYSIS_FAILED: {
        code: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: 940001,
        message: 'sharp로 이미지 색상을 추출할 수 없습니다.',
    },
} as const
