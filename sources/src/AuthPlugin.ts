import Keycloak from "keycloak-js";
import once from "lodash/once";
import { includes, throttle, type DebouncedFunc } from "lodash";
import LocalStorageUtils from "./LocalStorageUtils";
import { v4 as uuidv4 } from "uuid";
import type { AuthOptions } from "./AuthOptions";
import { AuthEvents, AuthEventNames } from "./AuthEvents";

export class AuthPlugin {
    private authOptions: AuthOptions | undefined;
    private keycloak: KeycloakPlugin = new KeycloakPlugin();
    private guest: GuestPlugin = new GuestPlugin();

    public hasRole(roleName?: string, apiClientId?: string): boolean {
        if (!roleName) {
            return true;
        }
        return this.guest.hasRole(roleName) || this.keycloak.hasRole(this.authOptions, roleName, apiClientId);
    }

    public get authenticated(): boolean {
        return this.guest.authenticated || this.keycloak.authenticated;
    }

    public get isGuest(): boolean {
        return this.guest.authenticated;
    }

    public async getToken(): Promise<string> {
        return this.guest.authenticated ? this.guest.getGuestId() : this.keycloak.getToken();
    }

    public initOnce: (authOptions: AuthOptions) => Promise<void> = once(async (authOptions) => {
        this.authOptions = authOptions;
        const guestAuthenticated = this.guest.init(this.authOptions);
        if (guestAuthenticated) {
            AuthEvents.emit(AuthEventNames.isGuestAuthenticated);
            return;
        }

        const keyCloakAuthenticated = await this.keycloak.init(this.authOptions);
        if (keyCloakAuthenticated) {
            AuthEvents.emit(AuthEventNames.isAlreadyAuthenticated);
        }
    });

    public async loginGuest(): Promise<void> {
        if (!this.authOptions) throw new Error("Init has to be called first");

        this.guest.login(this.authOptions);
    }

    public async login(idp: string): Promise<void> {
        await this.keycloak.login(window.location.href, idp);
    }

    public createLoginUrl(idp: string, customRedirectUri?: string): string {
        const redirectUri = customRedirectUri ? customRedirectUri : window.location.href;
        return this.keycloak.createLoginUrl(redirectUri, idp);
    }

    public createLogoutUrl(customRedirectUri?: string): string {
        const redirectUri = customRedirectUri ? customRedirectUri : window.location.href;
        return this.keycloak.createLogoutUrl(redirectUri);
    }

    public async update(): Promise<void> {
        const authenticated = await this.keycloak.initKeycloak();

        if (authenticated) {
            AuthEvents.emit(AuthEventNames.isAlreadyAuthenticated);
        }
    }

    public async logout(redirectUri: string): Promise<void> {
        if (this.guest.authenticated) {
            this.guest.logout();
            return;
        }

        await this.keycloak.logout(redirectUri);
    }
}

class KeycloakPlugin {
    private pluginState: { keycloak: Keycloak; accessTokenKey: string; refreshTokenKey: string; idTokenKey: string } | undefined;

    public hasRole(authOptions: AuthOptions | undefined, roleName: string, apiClientId?: string): boolean {
        if (!authOptions) return false;

        if (this.pluginState) {
            const resource = !apiClientId ? authOptions.apiClientId : apiClientId;
            return this.pluginState.keycloak.hasResourceRole(roleName, resource);
        }
        return false;
    }

    public get authenticated(): boolean {
        if (!this.pluginState?.keycloak) {
            return false;
        }

        return this.pluginState.keycloak.authenticated ?? false;
    }

    public async getToken(): Promise<string> {
        if (!this.pluginState?.keycloak || !this.pluginState.keycloak.refreshToken) {
            return "";
        }

        await this.refreshSingle();
        return this.pluginState.keycloak.token ?? "";
    }

    public async init(authOptions: AuthOptions): Promise<boolean> {
        try {
            if (!authOptions.appClientId || !authOptions.authUrl || !authOptions.realm) {
                return false;
            }

            const keycloak = new Keycloak({
                url: authOptions.authUrl,
                realm: authOptions.realm,
                clientId: authOptions.appClientId
            });

            this.pluginState = {
                keycloak: keycloak,
                accessTokenKey: `${authOptions.appClientId}-accessToken`,
                refreshTokenKey: `${authOptions.appClientId}-refreshToken`,
                idTokenKey: `${authOptions.appClientId}-idToken`
            };

            keycloak.onAuthSuccess = this.setLocalStorage.bind(this);
            keycloak.onAuthRefreshSuccess = this.setLocalStorage.bind(this);
            keycloak.onTokenExpired = this.onTokenExpired.bind(this);

            return this.initKeycloak();
        } catch (error) {
            console.error("auth init failed", error);
            this.clearLocalStorage();
            return false;
        }
    }

    public async initKeycloak(): Promise<boolean> {
        if (!this.pluginState) throw new Error("Init has to be called first");

        const authenticated: boolean = await this.pluginState.keycloak.init({
            flow: "standard",
            timeSkew: 0,
            enableLogging: false,
            refreshToken: LocalStorageUtils.getItem(this.pluginState.refreshTokenKey),
            token: LocalStorageUtils.getItem(this.pluginState.accessTokenKey),
            idToken: LocalStorageUtils.getItem(this.pluginState.idTokenKey)
        });

        if (authenticated) {
            console.debug("authenticated keycloak");
        }

        return authenticated;
    }

    private async onTokenExpired(): Promise<void> {
        // force refresh
        this.refresh(-1);
    }

    public async login(redirectUri: string, idp: string): Promise<void> {
        console.debug("login navigating to keycloak with returnUrl", redirectUri);

        if (!this.pluginState) throw new Error("Init has to be called first");
        await this.pluginState.keycloak.login({ redirectUri, idpHint: idp });
    }

    public createLoginUrl(redirectUri: string, idp: string): string {
        console.debug("create loginUrl to keycloak with returnUrl", redirectUri);

        if (!this.pluginState) throw new Error("Init has to be called first");
        return this.pluginState.keycloak.createLoginUrl({ redirectUri, idpHint: idp });
    }

    public createLogoutUrl(redirectUri: string): string {
        console.debug("create logoutUrl to keycloak with returnUrl", redirectUri);

        if (!this.pluginState) throw new Error("Init has to be called first");
        return this.pluginState.keycloak.createLogoutUrl({ redirectUri });
    }

    public async logout(redirectUri: string): Promise<void> {
        console.debug("logout navigating to keycloak with returnUrl", redirectUri);

        this.clearLocalStorage();

        if (!this.pluginState) return;
        await this.pluginState.keycloak.logout({ redirectUri });
    }

    private setLocalStorage(): void {
        if (!this.pluginState) return;

        LocalStorageUtils.setItem(this.pluginState.refreshTokenKey, this.pluginState.keycloak.refreshToken ?? "");
        LocalStorageUtils.setItem(this.pluginState.accessTokenKey, this.pluginState.keycloak.token ?? "");
        LocalStorageUtils.setItem(this.pluginState.idTokenKey, this.pluginState.keycloak.idToken ?? "");
    }

    private clearLocalStorage() {
        if (!this.pluginState) return;

        LocalStorageUtils.removeItem(this.pluginState.refreshTokenKey);
        LocalStorageUtils.removeItem(this.pluginState.accessTokenKey);
        LocalStorageUtils.removeItem(this.pluginState.idTokenKey);
    }

    public async refresh(minValidity: number): Promise<void> {
        try {
            if (!this.pluginState) return;

            const successful: boolean = await this.pluginState.keycloak.updateToken(minValidity);

            if (successful) {
                console.debug("token refreshed");
            }
        } catch (error) {
            console.error("token refresh failed", error || "token may be empty");
        }
    }

    // this method ensures that we have only one refresh call even when it gets executed multiple times in paralell
    // NOTE: time for 'throttle wait' (ms) must be lower then 'token minValidity' (sec)
    private refreshSingle: DebouncedFunc<() => Promise<void>> = throttle(() => this.refresh(10), 5000, { trailing: false });
}

class GuestPlugin {
    private pluginState: { guestKey: string; guestId: string; guestRoles: string[] } | undefined;

    public hasRole(roleName: string): boolean {
        if (!this.pluginState) return false;

        return includes(this.pluginState.guestRoles, roleName);
    }

    public get authenticated(): boolean {
        return this.pluginState?.guestId ? true : false;
    }

    public getGuestId(): string {
        return this.pluginState?.guestId ?? "";
    }

    public init(authOptions: AuthOptions): boolean {
        if (!authOptions.guestClientId) {
            return false;
        }

        const guestKey = `${authOptions.guestClientId}-guestId`;
        const guestId = LocalStorageUtils.getItem(guestKey);
        let guestRoles: string[] = [];

        if (guestId) {
            guestRoles = authOptions.guestRoles || ["User"];
            console.debug("authenticated guest");
        }

        this.pluginState = {
            guestKey: guestKey,
            guestId: guestId,
            guestRoles: guestRoles
        };

        return this.authenticated;
    }

    public login(authOptions: AuthOptions): void {
        console.debug("login guest");

        if (!this.pluginState) throw new Error("Init has to be called first");

        this.pluginState.guestId = uuidv4();
        LocalStorageUtils.setItem(this.pluginState.guestKey, this.pluginState.guestId);
        this.init(authOptions);
        AuthEvents.emit(AuthEventNames.isGuestAuthenticated);
    }

    public logout(): void {
        console.debug("logout guest");

        if (!this.pluginState) return;

        LocalStorageUtils.removeItem(this.pluginState.guestKey);

        this.pluginState.guestId = "";
        this.pluginState.guestRoles = [];
        window.location.reload();
    }
}
