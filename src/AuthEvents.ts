import Emittery from "emittery";

export enum AuthEventNames {
    isAlreadyAuthenticated = "isAlreadyAuthenticated",
    isGuestAuthenticated = "isGuestAuthenticated",
    loginRequired = "loginRequired",
    permissionDenied = "permissionDenied"
}

export const AuthEvents = new Emittery();
