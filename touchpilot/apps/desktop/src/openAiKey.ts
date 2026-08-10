import { invoke } from "@tauri-apps/api/core";

/**
 * The user's OpenAI API key, stored in the macOS Keychain.
 *
 * Voice transcription used to read this from `OPENAI_API_KEY` in the process
 * environment. That works when the app is started from a terminal and never
 * works otherwise: an app launched from Finder or the Dock inherits no shell
 * environment, so the variable is simply absent for every ordinary user, no
 * matter how valid their key is.
 *
 * Nothing here ever returns the key itself. The status carries only whether one
 * exists, where it came from, and the last few characters, which is enough to
 * answer "did I paste the right one" without moving the secret across the
 * bridge into somewhere it could be logged or captured in diagnostics.
 */

export type OpenAiKeySource = "keychain" | "environment" | "none";

export type OpenAiKeyStatus = {
  /** A key is saved in the Keychain and can be changed or removed here. */
  stored: boolean;
  /** A key is available from some source, so voice can work. */
  available: boolean;
  source: OpenAiKeySource;
  /** Last few characters, already masked. Never the whole key. */
  hint: string | null;
};

export const unknownOpenAiKeyStatus: OpenAiKeyStatus = Object.freeze({
  stored: false,
  available: false,
  source: "none",
  hint: null,
});

export function getOpenAiKeyStatus(): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("openai_api_key_status");
}

export function setOpenAiKey(key: string): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("set_openai_api_key", { key });
}

export function clearOpenAiKey(): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("clear_openai_api_key");
}

/**
 * What to tell the user about the current state, in their terms.
 *
 * The environment case matters: it works right now for whoever launched from a
 * terminal, and it will silently stop working for anyone who opens the app
 * normally. Saying only "a key is available" would hide that.
 */
export function describeOpenAiKeyStatus(status: OpenAiKeyStatus): string {
  if (status.source === "keychain") {
    return `Saved to your Keychain${status.hint ? ` (${status.hint})` : ""}. Voice is ready.`;
  }

  if (status.source === "environment") {
    return `Using OPENAI_API_KEY from the environment${
      status.hint ? ` (${status.hint})` : ""
    }. That only works when Toki is launched from a terminal — save a key here to use voice normally.`;
  }

  return "No key saved. Voice needs an OpenAI API key to turn speech into text.";
}

/**
 * The key that lets Toki look at the screen.
 *
 * Same store, same shape, different account. It replaced a developer CLI that
 * had to be installed before Toki could see anything -- and that ran inside
 * Toki's screen-recording grant, because macOS attributes permissions to the
 * process that launched it.
 */
export function getGeminiKeyStatus(): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("gemini_api_key_status");
}

export function setGeminiKey(key: string): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("set_gemini_api_key", { key });
}

export function clearGeminiKey(): Promise<OpenAiKeyStatus> {
  return invoke<OpenAiKeyStatus>("clear_gemini_api_key");
}

/**
 * The free tier is the point, so the message says so.
 *
 * "No vision credentials" was the old wording. It is true, and it leaves
 * somebody assuming there is a bill attached to fixing it.
 */
export function describeGeminiKeyStatus(status: OpenAiKeyStatus): string {
  if (status.source === "keychain") {
    return `Saved to your Keychain${status.hint ? ` (${status.hint})` : ""}. I can see your screen.`;
  }

  if (status.source === "environment") {
    return `Using GEMINI_API_KEY from the environment${
      status.hint ? ` (${status.hint})` : ""
    }. That only works when Toki is launched from a terminal — save a key here to use it normally.`;
  }

  return "No key saved. Get one free at aistudio.google.com/apikey — it costs nothing and takes a minute.";
}
