import type { KeycloakInitOptions } from "keycloak-js";

export interface AuthOptions {
    keycloakInitOptions?: KeycloakInitOptions;
    apiClientId?: string;
    appClientId?: string;
    guestClientId?: string;
    authUrl?: string;
    realm?: string;
    guestRoles?: string[];
}
