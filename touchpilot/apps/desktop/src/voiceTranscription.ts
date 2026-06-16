import type { VoiceTranscript } from "@touchpilot/shared";
import type { NativeVoiceCaptureStopResult } from "./nativeVoiceCapture";

export type VoiceTranscriptionResult =
  | {
      status: "ready";
      transcript: VoiceTranscript;
    }
  | {
      status: "not_configured";
      error: string;
    };

export async function transcribeNativeVoiceCapture(
  capture: NativeVoiceCaptureStopResult,
): Promise<VoiceTranscriptionResult> {
  if (capture.byteLength === 0) {
    return {
      status: "not_configured",
      error:
        "Native microphone capture is wired, but real audio recording is not connected yet.",
    };
  }

  return {
    status: "not_configured",
    error: "Cloud transcription provider is not configured yet.",
  };
}
