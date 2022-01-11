import Vue from 'vue';

export enum AuthEventNames {
    isAlreadyAuthenticated = 'isAlreadyAuthenticated',
    loginRequired = 'loginRequired',
    permissionDenied = 'permissionDenied'
}

export const AuthEvents = new Vue();
