import { invoke } from "@tauri-apps/api/core";

/**
 * Paths the operator configures for developer-only helper tools.
 *
 * Toki used to find these by searching `~/tools`, `~/.local/bin`, and `PATH`.
 * Those directories are writable without sudo, and macOS runs a launched
 * program inside the launcher's permissions — so a planted file would have run
 * with Toki's camera, microphone, and screen-recording access. The search was
 * removed; nothing is looked for any more.
 *
 * The first replacement read the path only from an environment variable, which
 * repeated a mistake this codebase had just fixed for the API key: an app
 * launched from Finder inherits no environment, so the value is absent for
 * every ordinary launch. Local transcription silently stopped working.
 *
 * A path typed into Preferences is exactly as deliberate as an exported
 * variable, and it survives a normal launch. The security property that matters
 * is preserved: a value exists because someone entered it, never because a
 * directory was scanned.
 */

export const whisperBinarySetting = "WHISPER_CPP_BIN";
export const whisperModelSetting = "WHISPER_CPP_MODEL";

export function getOperatorSetting(name: string): Promise<string | null> {
  return invoke<string | null>("operator_setting_status", { name });
}

export function setOperatorSetting(
  name: string,
  value: string,
): Promise<void> {
  return invoke<void>("set_operator_setting", { name, value });
}

/**
 * Whether anything can transcribe, asked before a recording is made.
 *
 * `provider` is null when neither backend is set up. The panel needs this to
 * stop offering push to talk as though holding it would do something — that
 * was only discoverable by holding it, reading the failure, and watching the
 * panel go back to inviting the same press.
 */
export type TranscriptionAvailability = {
  provider: "local-whisper" | "openai" | null;
  localWhisperReady: boolean;
  openaiReady: boolean;
};

export function getTranscriptionAvailability(): Promise<TranscriptionAvailability> {
  return invoke<TranscriptionAvailability>("transcription_availability");
}

/**
 * Whether local transcription can run at all.
 *
 * Both halves are required: the binary does the work, and it cannot start
 * without a model. Reporting them together avoids a half-configured state that
 * only fails once someone holds the pinch and speaks.
 */
export function describeLocalTranscription(
  binaryPath: string | null,
  modelPath: string | null,
): string {
  if (binaryPath && modelPath) {
    return "Local transcription is configured and runs entirely on this Mac.";
  }

  if (!binaryPath && !modelPath) {
    return "Not configured. Voice needs either these paths or an OpenAI API key.";
  }

  return binaryPath
    ? "A binary is set but no model. Local transcription needs both."
    : "A model is set but no binary. Local transcription needs both.";
}
