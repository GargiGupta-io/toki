import { invoke } from "@tauri-apps/api/core";

export type NativeVoiceCaptureStatus = {
  status: "idle" | "capturing";
  sessionId?: string;
  startedAtMs?: number;
  message: string;
};

export type NativeVoiceCaptureStartResult = {
  sessionId: string;
  startedAtMs: number;
  status: "capturing";
};

export type NativeVoiceCaptureStopResult = {
  sessionId: string;
  startedAtMs: number;
  stoppedAtMs: number;
  durationMs: number;
  byteLength: number;
  format: string;
  status: "stopped";
};

export function getNativeVoiceCaptureStatus(): Promise<NativeVoiceCaptureStatus> {
  return invoke<NativeVoiceCaptureStatus>("native_voice_capture_status");
}

export function startNativeVoiceCapture(): Promise<NativeVoiceCaptureStartResult> {
  return invoke<NativeVoiceCaptureStartResult>("native_voice_capture_start");
}

export function stopNativeVoiceCapture(): Promise<NativeVoiceCaptureStopResult> {
  return invoke<NativeVoiceCaptureStopResult>("native_voice_capture_stop");
}
