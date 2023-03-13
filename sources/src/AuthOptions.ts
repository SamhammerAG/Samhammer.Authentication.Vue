export interface AuthOptions {
    apiClientId: string;
    appClientId: string;
    guestClientId?: string;
    authUrl: string;
    realm: string;
    guestRoles?: string[];
}
