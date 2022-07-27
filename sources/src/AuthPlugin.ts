import Keycloak from 'keycloak-js';
import once from 'lodash/once';
import { includes, throttle } from 'lodash';
import LocalStorageUtils from './LocalStorageUtils';
import { v4 as uuidv4 } from 'uuid';
import { AuthOptions } from './AuthOptions';
import { AuthEvents, AuthEventNames } from './AuthEvents';

export class AuthPlugin {
    private authOptions: AuthOptions;
    private keycloak: KeycloakPlugin = new KeycloakPlugin();
    private guest: GuestPlugin = new GuestPlugin();

    public hasRole(roleName: string): boolean {
        if (!roleName) {
            return true;
        }

        return this.guest.hasRole(roleName) || this.keycloak.hasRole(this.authOptions, roleName);
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

    public initOnce: (authOptions: AuthOptions) => Promise<boolean> = once(async (authOptions) => {
        this.authOptions = authOptions;
        const authenticated: boolean = this.guest.init(this.authOptions) || (await this.keycloak.init(this.authOptions));

        if (authenticated) {
            AuthEvents.$emit(AuthEventNames.isAlreadyAuthenticated);
        }

        return authenticated;
    });

    public async loginGuest(): Promise<void> {
        this.guest.login(this.authOptions);
    }

    public async login(idp: string): Promise<void> {
        await this.keycloak.login(window.location.href, idp);
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
    private keycloak: Keycloak.KeycloakInstance = null;
    private accessTokenKey: string = null;
    private refreshTokenKey: string = null;

    public hasRole(authOptions: AuthOptions, roleName: string): boolean {
        return this.keycloak && this.keycloak.hasResourceRole(roleName, authOptions.apiClientId);
    }

    public get authenticated(): boolean {
        if (!this.keycloak) {
            return false;
        }

        return this.keycloak.authenticated;
    }

    public async getToken(): Promise<string> {
        if (!this.keycloak || !this.keycloak.refreshToken) {
            return null;
        }

        await this.refreshSingle();
        return this.keycloak.token;
    }

    public async init(authOptions: AuthOptions): Promise<boolean> {
        try {
            this.accessTokenKey = `${authOptions.appClientId}-accessToken`;
            this.refreshTokenKey = `${authOptions.appClientId}-refreshToken`;

            this.keycloak = Keycloak({
                url: authOptions.authUrl,
                realm: authOptions.realm,
                clientId: authOptions.appClientId
            });

            this.keycloak.onAuthSuccess = this.onAuthSuccess.bind(this);
            this.keycloak.onAuthRefreshSuccess = this.onAuthRefreshSuccess.bind(this);
            this.keycloak.onTokenExpired = this.onTokenExpired.bind(this);

            const authenticated: boolean = await this.keycloak.init({
                flow: 'standard',
                timeSkew: 0,
                enableLogging: false,
                refreshToken: LocalStorageUtils.getItem(this.refreshTokenKey),
                token: LocalStorageUtils.getItem(this.accessTokenKey)
            });

            if (authenticated) {
                console.debug('authenticated keycloak');
            }

            return authenticated;
        } catch (error) {
            console.error('auth init failed', error);
            LocalStorageUtils.removeItem(this.refreshTokenKey);
            LocalStorageUtils.removeItem(this.accessTokenKey);
            return false;
        }
    }

    private onAuthSuccess(): void {
        LocalStorageUtils.setItem(this.refreshTokenKey, this.keycloak.refreshToken);
        LocalStorageUtils.setItem(this.accessTokenKey, this.keycloak.token);
    }

    private onAuthRefreshSuccess(): void {
        LocalStorageUtils.setItem(this.refreshTokenKey, this.keycloak.refreshToken);
        LocalStorageUtils.setItem(this.accessTokenKey, this.keycloak.token);
    }

    private async onTokenExpired(): Promise<void> {
        // force refresh
        this.refresh(-1);
    }

    public async login(redirectUri: string, idp: string): Promise<void> {
        console.debug('login navigating to keycloak with returnUrl', redirectUri);
        await this.keycloak.login({ redirectUri, idpHint: idp });
    }

    public async logout(redirectUri: string): Promise<void> {
        console.debug('logout navigating to keycloak with returnUrl', redirectUri);

        LocalStorageUtils.removeItem(this.refreshTokenKey);
        LocalStorageUtils.removeItem(this.accessTokenKey);

        await this.keycloak.logout({ redirectUri });
    }

    public async refresh(minValidity: number): Promise<void> {
        try {
            if (!this.keycloak?.refreshToken) {
                return;
            }

            const successful: boolean = await this.keycloak.updateToken(minValidity);

            if (successful) {
                console.debug('token refreshed');
            }
        } catch (error) {
            console.error('token refresh failed', error || 'token may be empty');
        }
    }

    // this method ensures that we have only one refresh call even when it gets executed multiple times in paralell
    // NOTE: time for 'throttle wait' (ms) must be lower then 'token minValidity' (sec)
    private refreshSingle: () => Promise<void> = throttle(() => this.refresh(10), 5000, { trailing: false });
}

class GuestPlugin {
    private guestKey: string = null;

    private guestId: string = null;
    private guestRoles: string[] = [];

    public hasRole(roleName: string): boolean {
        return includes(this.guestRoles, roleName);
    }

    public get authenticated(): boolean {
        return this.guestId ? true : false;
    }

    public getGuestId(): string {
        return this.guestId;
    }

    public init(authOptions: AuthOptions): boolean {
        this.guestKey = `${authOptions.appClientId}-guestId`;
        this.guestId = LocalStorageUtils.getItem(this.guestKey);

        if (this.authenticated) {
            this.guestRoles = ['User'];
            console.debug('authenticated guest');
        }

        return this.authenticated;
    }

    public login(authOptions: AuthOptions): void {
        console.debug('login guest');
        this.guestId = uuidv4();
        LocalStorageUtils.setItem(this.guestKey, this.guestId);
        this.init(authOptions);
        AuthEvents.$emit(AuthEventNames.isGuestAuthenticated);
    }

    public logout(): void {
        console.debug('logout guest');
        LocalStorageUtils.removeItem(this.guestKey);
        this.guestId = null;
        this.guestRoles = null;
        window.location.reload();
    }
}
