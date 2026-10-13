import axios from 'axios';

// Module augmentation: axios 1.x has no built-in `metadata` bag on request
// config, but the request interceptor uses one to record whether the outgoing
// call carried an Authorization token (so the 401 interceptor can tell "my
// session expired" apart from "anonymous visitor hit a token-required
// endpoint" — public portal reads now run logged-out).
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: { hadToken: boolean };
  }
}

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Remember whether THIS request carried a token, so the 401 interceptor can
  // tell "my session expired" apart from "anonymous visitor hit an auth'd
  // endpoint" (public portal reads now run logged-out — Open Forecast).
  config.metadata = { hadToken: Boolean(token) };
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // FIX (TypeError: Cannot read properties of undefined (reading 'status')):
    // error.response is undefined for network/CORS failures and server-down
    // (no HTTP response at all). Only an actual 401 RESPONSE may trigger the
    // session-expiry redirect; everything else just rejects for the caller.
    //
    // FIX (logged-out browse): the redirect also only makes sense when the
    // failed request actually CARRIED a token (real session expiry). An
    // anonymous visitor getting 401 from a token-required endpoint (e.g.
    // submit report) must stay on the page to see the login prompt, not be
    // bounced to the landing page by the interceptor.
    const hadToken = error.config?.metadata?.hadToken ?? false;
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (!isLoginRequest && hadToken && error.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default api;