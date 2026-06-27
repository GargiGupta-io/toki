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

export async function collectScreenCandidatesForGuidance(
  screenshot: ScreenshotCapture,
  display: DisplayContext,
): Promise<ScreenCandidateResult> {
  try {
    return await invoke<ScreenCandidateResult>("collect_screen_candidates", {
      request: {
        imageBase64: screenshot.imageBase64,
        imageWidth: screenshot.imageWidth,
        imageHeight: screenshot.imageHeight,
        displayWidth: display.width,
        displayHeight: display.height,
        scaleFactor: display.scaleFactor,
      },
    });
  } catch (error) {
    return {
      candidates: [],
      candidateSource: "unavailable",
      candidateError: error instanceof Error ? error.message : String(error),
    };
  }
}
