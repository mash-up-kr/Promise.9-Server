import { ApiProperty } from '@nestjs/swagger'

import { PUSH_TOKEN_PLATFORMS } from '../push-token.constant'

export class RegisterPushTokenDto {
    @ApiProperty({
        example: 'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        description: '앱에서 발급받은 Expo Push Token',
    })
    token!: string
    @ApiProperty({ enum: PUSH_TOKEN_PLATFORMS, example: 'ios' })
    platform!: (typeof PUSH_TOKEN_PLATFORMS)[number]
}
