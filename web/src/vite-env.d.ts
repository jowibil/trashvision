/// <reference types="vite/client" />

/**
 * Env contract for the portal. Only these keys are consumed by the app —
 * keep in sync with web/.env.example.
 */
interface ImportMetaEnv {
  /** Backend root URL the portal talks to; REQUIRED in production builds. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
