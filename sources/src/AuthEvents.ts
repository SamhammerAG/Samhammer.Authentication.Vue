import Vue from 'vue';

export enum AuthEventNames {
    isAlreadyAuthenticated = 'isAlreadyAuthenticated',
    isGuestAuthenticated = 'isGuestAuthenticated',
    loginRequired = 'loginRequired',
    permissionDenied = 'permissionDenied'
}

export const AuthEvents = new Vue();
