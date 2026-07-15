/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKI_GUIDANCE_ENDPOINT?: string;
  readonly VITE_TOKI_CODEX_MODEL?: string;
  readonly VITE_TOKI_CODEX_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
