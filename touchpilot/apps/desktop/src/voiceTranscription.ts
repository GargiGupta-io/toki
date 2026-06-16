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
  if (!capture.audioBase64 || capture.byteLength <= 44) {
    return {
      status: "not_configured",
      error: "Native microphone capture completed, but no usable audio was recorded.",
    };
  }

  return {
    status: "not_configured",
    error: `Native microphone captured ${(capture.byteLength / 1024).toFixed(
      1,
    )} KB of ${capture.format}; cloud transcription provider is not configured yet.`,
  };
}
