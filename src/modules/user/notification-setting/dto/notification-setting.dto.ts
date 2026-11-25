import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotificationSettingsResponseDto {
    @ApiProperty({
        example: true,
        description: '리마인드 이메일 수신 여부. 설정한 적 없으면 true',
    })
    email!: boolean

    @ApiProperty({
        example: true,
        description: '리마인드 앱 푸시 수신 여부. 설정한 적 없으면 true',
    })
    push!: boolean
}

export class UpdateNotificationSettingsDto {
    @ApiPropertyOptional({ example: false, description: '이메일 수신 여부' })
    email?: boolean

    @ApiPropertyOptional({ example: true, description: '앱 푸시 수신 여부' })
    push?: boolean
}
