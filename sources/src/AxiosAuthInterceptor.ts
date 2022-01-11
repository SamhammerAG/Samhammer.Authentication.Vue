import { AxiosRequestConfig, AxiosError, AxiosInstance } from 'axios';
import { AuthEvents, AuthEventNames } from './AuthEvents';
import Auth from './index';

export class AxiosAuthInterceptor {
    public static addAuthTokenInterceptor(axiosInstance: AxiosInstance): number {
        const onRequest: (config: AxiosRequestConfig) => Promise<AxiosRequestConfig> = async (requestConfig: AxiosRequestConfig) => {
            const token: string = await Auth.getToken();

            if (token) {
                if (Auth.isGuest) {
                    requestConfig.headers['guestid'] = token;
                } else {
                    requestConfig.headers['Authorization'] = `Bearer ${token}`;
                }
            }

            return requestConfig;
        };

        return axiosInstance.interceptors.request.use(onRequest, null);
    }

    public static addAuthErrorInterceptor(axiosInstance: AxiosInstance): number {
        const onError: (error: AxiosError) => void = async (error: AxiosError) => {
            if (error.response?.status === 401) {
                console.warn('axios api request requires authentication', error.config?.url, error.message);
                AuthEvents.$emit(AuthEventNames.loginRequired);
            } else if (error.response?.status === 403) {
                console.warn('axios api request requires permission', error.config?.url, error.message);
                AuthEvents.$emit(AuthEventNames.permissionDenied);
            }

            throw error;
        };

        return axiosInstance.interceptors.response.use(null, onError);
    }
}
