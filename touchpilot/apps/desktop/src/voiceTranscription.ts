// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { invoke } from "@tauri-apps/api/core";
import type { VoiceTranscript } from "@toki/shared";
import type { NativeVoiceCaptureStopResult } from "./nativeVoiceCapture";
import {
  getTranscriptionAvailability,
  type TranscriptionAvailability,
} from "./operatorSettings";

/**
 * Turning a held-down key's worth of audio into words.
 *
 * Three ways, tried in an order that is a policy, not an accident:
 *
 * 1. **Local Whisper**, when somebody has set it up. On-device, free, and no
 *    audio leaves the Mac. An explicit private choice must never be trumped
 *    by a default.
 * 2. **Their own OpenAI key**, when they have saved one. Also explicit.
 * 3. **Toki's own service**, signed in. This is what a fresh install uses,
 *    and it is why a downloader can speak without compiling anything or
 *    pasting a key -- the service holds the same free-tier credential it
 *    already uses to look at screens.
 *
 * A *configured* backend that fails is not handed to the next one down. The
 * failure of a local Whisper somebody chose is theirs to see, and quietly
 * sending the same audio to the cloud instead would be exactly the behaviour
 * the on-device choice exists to rule out.
 */

export type VoiceTranscriptionResult =
  | {
      status: "ready";
      transcript: VoiceTranscript;
    }
  | {
      status: "not_configured";
      error: string;
    };

export type HostedTranscriptionReply =
  | { kind: "ready"; text: string }
  | { kind: "signed_out"; error: string }
  | { kind: "error"; error: string };

export type VoiceTranscriptionOptions = {
  /** The service, when this build has one and somebody is signed in. */
  hosted?: {
    send: (body: {
      audioBase64: string;
      format: string;
    }) => Promise<HostedTranscriptionReply>;
  };
  /**
   * What to say when nothing local is set up and nobody is signed in.
   *
   * The caller knows whether a service exists to sign in to; this module does
   * not. Without it the native error speaks, which tells people to compile
   * Whisper or find an API key -- the right instruction only for a build that
   * has no service at all.
   */
  whenSignedOut?: string;
  /** Injected by tests, so no test needs a native bridge. */
  invokeImpl?: typeof invoke;
  availabilityImpl?: () => Promise<TranscriptionAvailability>;
};

type NativeVoiceTranscriptionResponse = {
  text: string;
  provider: "local-whisper" | "openai";
  model: string;
  byteLength: number;
  sampleRate: number;
  channels: number;
};

function readyResult(text: string): VoiceTranscriptionResult {
  return {
    status: "ready",
    transcript: {
      text,
      isFinal: true,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function transcribeNativeVoiceCapture(
  capture: NativeVoiceCaptureStopResult,
  options: VoiceTranscriptionOptions = {},
): Promise<VoiceTranscriptionResult> {
  if (!capture.audioBase64 || capture.byteLength <= 44) {
    return {
      status: "not_configured",
      error: "Native microphone capture completed, but no usable audio was recorded.",
    };
  }

  const invokeImpl = options.invokeImpl ?? (invoke as typeof invoke);
  const availabilityImpl = options.availabilityImpl ?? getTranscriptionAvailability;

  // Asked before transcribing rather than inferred from an error afterwards,
  // because "nothing is configured" and "the configured thing failed" must
  // stay different conditions. Only the first ever falls through to the
  // service.
  const availability = await availabilityImpl().catch(() => null);
  const hasExplicitBackend = availability?.provider != null;

  if (!hasExplicitBackend && options.hosted != null) {
    const reply = await options.hosted
      .send({ audioBase64: capture.audioBase64, format: capture.format })
      .catch((error): HostedTranscriptionReply => ({
        kind: "error",
        error: error instanceof Error ? error.message : String(error),
      }));

    if (reply.kind === "ready") {
      if (reply.text.trim().length === 0) {
        // Worded so the retry detector recognises it; see
        // isRecoverableVoiceTranscriptionError.
        return {
          status: "not_configured",
          error: "The recording contained no speech.",
        };
      }

      return readyResult(reply.text);
    }

    return { status: "not_configured", error: reply.error };
  }

  if (!hasExplicitBackend && options.whenSignedOut != null) {
    return { status: "not_configured", error: options.whenSignedOut };
  }

  try {
    const transcription = await invokeImpl<NativeVoiceTranscriptionResponse>(
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

    return readyResult(transcription.text);
  } catch (error) {
    return {
      status: "not_configured",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
