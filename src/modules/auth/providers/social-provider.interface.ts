export interface SocialPayload {
    providerId: string
    email: string
    providerRefreshTokenEncrypted?: string
    providerClientId?: string
}

export interface SocialProvider {
    verify(
        idToken: string,
        authorizationCode?: string,
        redirectUri?: string,
    ): Promise<SocialPayload>
}
