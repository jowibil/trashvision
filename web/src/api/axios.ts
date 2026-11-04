import axios from 'axios';

// TypeScript note: axios 1.x has no `metadata` field on request config, so
// this declares the one extra key the request interceptor adds — whether the
// outgoing call carried a token. The 401 handler below reads it back to tell
// "my session expired" apart from "an anonymous visitor hit a token-required
// endpoint" (public portal reads run without login).
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: { hadToken: boolean };
  }
}

// The API root comes from the environment, never a constant. A deployed
// bundle that still pointed at localhost would make every visitor's browser
// call their own machine, so: dev keeps a localhost fallback (zero-setup
// dev server), while a production build without VITE_API_URL fails loudly
// at startup instead of firing broken requests.
const resolveBaseURL = (): string => {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
  throw new Error(
    "VITE_API_URL is not configured. Set it in web/.env (or at build time) " +
      "before deploying the portal.",
  );
};

const api = axios.create({
  baseURL: resolveBaseURL(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Stash whether THIS request carried a token. The 401 handler below uses
  // it to tell "my session expired" apart from "an anonymous visitor hit an
  // auth-required endpoint" — public portal reads run without login.
  config.metadata = { hadToken: Boolean(token) };
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // error.response is undefined when there is no HTML response at all
    // (network/CORS failure, server down) — reading status on it crashes the
    // error handler itself. So: only an actual 401 response may trigger the
    // session-expiry redirect; everything else just rejects to the caller.
    //
    // Redirecting only makes sense for a request that actually CARRIED a
    // token (true session expiry). An anonymous visitor getting 401 from a
    // token-required endpoint (e.g. submitting a report) must stay on the
    // page to see the login prompt, not be bounced to the landing page.
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