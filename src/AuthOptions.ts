import type { KeycloakInitOptions } from "keycloak-js";
import type { Store } from "./Store";

export interface AuthOptions {
    keycloakInitOptions?: KeycloakInitOptions;
    apiClientId?: string;
    appClientId?: string;
    guestClientId?: string;
    authUrl?: string;
    realm?: string;
    guestRoles?: string[];
    store?: Store;
}
