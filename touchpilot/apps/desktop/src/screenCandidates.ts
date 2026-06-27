import { invoke } from "@tauri-apps/api/core";
import type {
  DisplayContext,
  GuidanceScreenContext,
  ScreenshotCapture,
} from "@toki/shared";

type ScreenCandidateResult = Pick<
  GuidanceScreenContext,
  "candidates" | "candidateSource" | "candidateError"
>;

const MAX_LIVE_GUIDANCE_CANDIDATES = 20;

export async function collectScreenCandidatesForGuidance(
  screenshot: ScreenshotCapture,
  display: DisplayContext,
): Promise<ScreenCandidateResult> {
  try {
    const result = await invoke<ScreenCandidateResult>("collect_screen_candidates", {
      request: {
        imageBase64: screenshot.imageBase64,
        imageWidth: screenshot.imageWidth,
        imageHeight: screenshot.imageHeight,
        displayWidth: display.width,
        displayHeight: display.height,
        scaleFactor: display.scaleFactor,
      },
    });

    return {
      ...result,
      candidates: result.candidates?.slice(0, MAX_LIVE_GUIDANCE_CANDIDATES) ?? [],
    };
  } catch (error) {
    return {
      candidates: [],
      candidateSource: "unavailable",
      candidateError: error instanceof Error ? error.message : String(error),
    };
  }
}
