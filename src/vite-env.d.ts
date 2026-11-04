/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project API key (public, safe to ship in the browser bundle). */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host — defaults to https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
