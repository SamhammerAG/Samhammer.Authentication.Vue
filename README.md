# Samhammer.Authentication.Vue

This is a generic Oauth/Jwt authentication library for vuejs applications.
It can be used with any vue app if you are relying on keycloak for authentication.

Uses keycloak-js internally: https://www.npmjs.com/package/keycloak-js

## What can it do

* Supports keycloak login
* Guest auth / User identification over a random guid
* Automatically add the token to requests
* Handles token refresh
* Logout

## How to use

### Initialization

Add the import: import Auth from '@samhammer/authentication-vue';

Before checking if the user is authenticated or doing anything else with the library you have to ensure that the initialization has been done properly. You can call the below method multiple times and the initialization is just done once during application lifetime.

``` js
import Auth from '@samhammer/authentication-vue';
Auth.initOnce(authOptions)
```

##### InitOnce Arguments:

| Name | Description |
| ----------- | ----------- |
| apiClientId | The client id your api uses (required for role checks)  |
| appClientId | The id of the public client used for authentication |
| authUrl | The base auth url of keycloak (e.g. "https://auth.myserver.de/auth") |
| realm | Authentication realm used in keycloak |

##### InitOnce Return value and Events

InitOnce returns ture if the user is already authenticated.
Also the event "AuthEventNames.isAlreadyAuthenticated" is emitted.

### Keycloak login

Below call will trigger the web login flow. The auth token is saved to the local storage.
After successful login keycloak will redirect to the given url.

``` js
import Auth from '@samhammer/authentication-vue';
Auth.login(window.location.href);
```

### Guest login

If you wan't to use guest authentication just call "Auth.loginGuest()". A new random guid will be generated and saved in the local storage.

Guests always have the role "User" only.

``` js
import Auth from '@samhammer/authentication-vue';
Auth.loginGuest()
```

### Logout

Logout removes the token from local storage and does a keycloak logout (if not guest).

``` js
import Auth from '@samhammer/authentication-vue';
Auth.logout()
```

### Check auth state and roles

* Auth.authenticated => Check if a user is authenticated. Returns true if so.
* Auth.hasRole('roleName', 'apiClientId') => Check if a user has a specific role for api client id, if apiclientid is not specified, the apiclientid in AuthOptions will be used.
* Auth.isGuest => Returns true if authenticted as guest

### Send auth token to api

##### With axios

* addAuthTokenInterceptor => Automatically adds the auth token to axios requests. With keycloak authentication the header named "Authentication" is used for the json web token. With guest auth the random guid is added to the header "guestid".
* addAuthErrorInterceptor => Handles auth errors by emititing the vue event "AuthEventNames.loginRequired" in case of an error 401 and "AuthEventNames.permissionDenied" in case of an 403 http status response

Just add the following snippet for the described behavior:

``` js
import axios, { AxiosInstance } from 'axios';
import { AuthAxiosInterceptor } from '@samhammer/authentication-vue';

AuthAxiosInterceptor.addAuthTokenInterceptor(axios);
AuthAxiosInterceptor.addAuthErrorInterceptor(axios);
```

##### Manually

You can implement passing the token by yourself. Just don't call the methods to add axios interceptors and fetch the token like that:

``` js
import Auth from '@samhammer/authentication-vue';
Auth.getToken()
```

Note: In case of guest authentication the token is the random guid of the guest.

### Events

* isAlreadyAuthenticated = Triggered on initOnce if the user is already signed in
* loginRequired = Triggered on an axios request in case of a status code 401 (addAuthErrorInterceptor required)
* permissionDenied = Triggered on an axios request in case of a status code 403 (addAuthErrorInterceptor required)

Can be handled like that:
``` js
import { AuthEvents, AuthEventNames } from "@samhammer/authentication-vue";

public mounted(): void {
    AuthEvents.$on(AuthEventNames.permissionDenied, this.onPermissionDenied);
}

public beforeDestroy(): void {
    AuthEvents.$off(AuthEventNames.permissionDenied, this.onPermissionDenied);
}

private onPermissionDenied(): void {
    // Do something
}
```

## How to publish

* Increase version in package.json and push to git.
* Add tag with semver version and push to git.
* Check github action to validated, that package was released to npm registry.
