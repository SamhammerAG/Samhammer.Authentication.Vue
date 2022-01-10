import Vue from 'vue';

export enum AuthEventNames {
    isAlreadyAuthenticated = 'isAlreadyAuthenticated',
    loginRequired = 'loginRequired',
    permissionDenied = 'permissionDenied'
}

export default new Vue();
