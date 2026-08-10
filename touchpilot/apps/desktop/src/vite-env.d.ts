/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKI_GUIDANCE_ENDPOINT?: string;
  readonly VITE_TOKI_GEMINI_MODEL?: string;
  readonly VITE_TOKI_VISION_TIMEOUT_MS?: string;
  /**
   * Sign-in project. The anon key is meant to be public and ships inside the
   * app; row level security in the database is what actually protects data,
   * not the secrecy of this value.
   */
  readonly VITE_TOKI_SUPABASE_URL?: string;
  readonly VITE_TOKI_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
