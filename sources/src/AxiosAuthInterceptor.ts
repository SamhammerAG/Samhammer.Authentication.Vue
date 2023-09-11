import type { AxiosError, AxiosInstance } from "axios";
import { AuthEvents, AuthEventNames } from "./AuthEvents";
import Auth from "./index";

export class AxiosAuthInterceptor {
    public static addAuthTokenInterceptor(axiosInstance: AxiosInstance): number {
        return axiosInstance.interceptors.request.use(async (requestConfig) => {
            const token: string = await Auth.getToken();

            if (token) {
                if (Auth.isGuest) {
                    requestConfig.headers["guestid"] = token;
                } else {
                    requestConfig.headers["Authorization"] = `Bearer ${token}`;
                }
            }

            return requestConfig;
        }, null);
    }

    public static addAuthErrorInterceptor(axiosInstance: AxiosInstance): number {
        return axiosInstance.interceptors.response.use(null, (error: AxiosError) => {
            if (error.response?.status === 401) {
                console.warn("axios api request requires authentication", error.config?.url, error.message);
                AuthEvents.emit(AuthEventNames.loginRequired);
            } else if (error.response?.status === 403) {
                console.warn("axios api request requires permission", error.config?.url, error.message);
                AuthEvents.emit(AuthEventNames.permissionDenied);
            }

            throw error;
        });
    }
}
