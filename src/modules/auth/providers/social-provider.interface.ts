export interface SocialPayload {
    providerId: string
    email: string
}

export interface SocialProvider {
    verify(idToken: string): Promise<SocialPayload>
}
