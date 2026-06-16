import { invoke } from "@tauri-apps/api/core";
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

type NativeVoiceTranscriptionResponse = {
  text: string;
  provider: "openai";
  model: string;
  byteLength: number;
  sampleRate: number;
  channels: number;
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

  try {
    const transcription = await invoke<NativeVoiceTranscriptionResponse>(
      "transcribe_voice_capture",
      {
        request: {
          audioBase64: capture.audioBase64,
          format: capture.format,
          sampleRate: capture.sampleRate,
          channels: capture.channels,
        },
      },
    );

    return {
      status: "ready",
      transcript: {
        text: transcription.text,
        isFinal: true,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      status: "not_configured",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
