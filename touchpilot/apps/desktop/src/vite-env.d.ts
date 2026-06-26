/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKI_GUIDANCE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
