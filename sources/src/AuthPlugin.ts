import Keycloak from "keycloak-js";
import once from "lodash/once";
import { includes, throttle, type DebouncedFunc } from "lodash";
import { v4 as uuidv4 } from "uuid";
import type { AuthOptions } from "./AuthOptions";
import { AuthEvents, AuthEventNames } from "./AuthEvents";
import StoreProvider from "./StoreProvider";

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

        if (authOptions.store) {
            StoreProvider.setStore(authOptions.store);
        }

        const guestAuthenticated = await this.guest.init(this.authOptions);
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

        await this.guest.login(this.authOptions);
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
            await this.guest.logout();
            return;
        }

        await this.keycloak.logout(redirectUri);
    }
}

class KeycloakPlugin {
    private pluginState: { keycloak?: Keycloak; authOptions: AuthOptions; accessTokenKey: string; refreshTokenKey: string; idTokenKey: string } | undefined;

    public hasRole(authOptions: AuthOptions | undefined, roleName: string, apiClientId?: string): boolean {
        if (!authOptions) return false;

        if (this.pluginState && this.pluginState.keycloak) {
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

            this.pluginState = {
                authOptions: authOptions,
                accessTokenKey: `${authOptions.appClientId}-accessToken`,
                refreshTokenKey: `${authOptions.appClientId}-refreshToken`,
                idTokenKey: `${authOptions.appClientId}-idToken`
            };

            return this.initKeycloak();
        } catch (error) {
            console.error("auth init failed", error);
            await this.clearStorage();
            return false;
        }
    }

    public async initKeycloak(): Promise<boolean> {
        if (!this.pluginState) throw new Error("Init has to be called first");

        delete this.pluginState.keycloak;

        this.pluginState.keycloak = this.getKeycloakInstance();
        this.pluginState.keycloak.onAuthSuccess = this.setStorage.bind(this);
        this.pluginState.keycloak.onAuthRefreshSuccess = this.setStorage.bind(this);
        this.pluginState.keycloak.onTokenExpired = this.onTokenExpired.bind(this);

        const authenticated: boolean = await this.pluginState.keycloak.init({
            flow: "standard",
            timeSkew: 0,
            enableLogging: false,
            refreshToken: await StoreProvider.store.getItem(this.pluginState.refreshTokenKey),
            token: await StoreProvider.store.getItem(this.pluginState.accessTokenKey),
            idToken: await StoreProvider.store.getItem(this.pluginState.idTokenKey),
            ...this.pluginState.authOptions.keycloakInitOptions
        });

        if (authenticated) {
            console.debug("authenticated keycloak");
        }

        return authenticated;
    }

    private async onTokenExpired(): Promise<void> {
        // force refresh
        await this.refresh(-1);
    }

    public async login(redirectUri: string, idp: string): Promise<void> {
        console.debug("login navigating to keycloak with returnUrl", redirectUri);

        if (!this.pluginState || !this.pluginState?.keycloak) throw new Error("Init has to be called first");
        await this.pluginState.keycloak.login({ redirectUri, idpHint: idp });
    }

    public createLoginUrl(redirectUri: string, idp: string): string {
        console.debug("create loginUrl to keycloak with returnUrl", redirectUri);

        if (!this.pluginState || !this.pluginState.keycloak) throw new Error("Init has to be called first");
        return this.pluginState.keycloak.createLoginUrl({ redirectUri, idpHint: idp });
    }

    public createLogoutUrl(redirectUri: string): string {
        console.debug("create logoutUrl to keycloak with returnUrl", redirectUri);

        if (!this.pluginState || !this.pluginState.keycloak) throw new Error("Init has to be called first");
        return this.pluginState.keycloak.createLogoutUrl({ redirectUri });
    }

    public async logout(redirectUri: string): Promise<void> {
        console.debug("logout navigating to keycloak with returnUrl", redirectUri);

        await this.clearStorage();

        if (!this.pluginState || !this.pluginState.keycloak) return;
        await this.pluginState.keycloak.logout({ redirectUri });
    }

    private async setStorage(): Promise<void> {
        if (!this.pluginState || !this.pluginState.keycloak) return;

        await StoreProvider.store.setItem(this.pluginState.refreshTokenKey, this.pluginState.keycloak.refreshToken ?? "");
        await StoreProvider.store.setItem(this.pluginState.accessTokenKey, this.pluginState.keycloak.token ?? "");
        await StoreProvider.store.setItem(this.pluginState.idTokenKey, this.pluginState.keycloak.idToken ?? "");
    }

    private async clearStorage() {
        if (!this.pluginState) return;

        await StoreProvider.store.removeItem(this.pluginState.refreshTokenKey);
        await StoreProvider.store.removeItem(this.pluginState.accessTokenKey);
        await StoreProvider.store.removeItem(this.pluginState.idTokenKey);
    }

    public async refresh(minValidity: number): Promise<void> {
        try {
            if (!this.pluginState || !this.pluginState.keycloak) return;

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

    public getKeycloakInstance(): Keycloak {
        const state = this.pluginState;

        if (!state || !state.authOptions.appClientId || !state.authOptions.authUrl || !state.authOptions.realm) {
            throw new Error("AuthOptions need to be set correctly");
        }

        return new Keycloak({
            url: state.authOptions.authUrl,
            realm: state.authOptions.realm,
            clientId: state.authOptions.appClientId
        });
    }
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

    public async init(authOptions: AuthOptions): Promise<boolean> {
        if (!authOptions.guestClientId) {
            return false;
        }

        const guestKey = `${authOptions.guestClientId}-guestId`;
        const guestId = await StoreProvider.store.getItem(guestKey);
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

    public async login(authOptions: AuthOptions): Promise<void> {
        console.debug("login guest");

        if (!this.pluginState) throw new Error("Init has to be called first");

        this.pluginState.guestId = uuidv4();
        await StoreProvider.store.setItem(this.pluginState.guestKey, this.pluginState.guestId);
        await this.init(authOptions);
        AuthEvents.emit(AuthEventNames.isGuestAuthenticated);
    }

    public async logout(): Promise<void> {
        console.debug("logout guest");

        if (!this.pluginState) return;

        await StoreProvider.store.removeItem(this.pluginState.guestKey);

        this.pluginState.guestId = "";
        this.pluginState.guestRoles = [];
        window.location.reload();
    }
}
