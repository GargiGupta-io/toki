import { invoke } from "@tauri-apps/api/core";
import type {
  DisplayContext,
  GuidanceScreenContext,
  ScreenshotCapture,
} from "@toki/shared";
import { fuseCandidateEvidence } from "./candidateFusion";
import { rankScreenCandidates } from "./candidateRanking";

type ScreenCandidateResult = Pick<
  GuidanceScreenContext,
  "candidates" | "candidateSource" | "candidateEvidence" | "candidateError"
>;

const MAX_LIVE_GUIDANCE_CANDIDATES = 20;

export async function collectScreenCandidatesForGuidance(
  screenshot: ScreenshotCapture,
  display: DisplayContext,
  goal: string,
  appName?: string | null,
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
        appName: appName ?? screenshot.activeWindow?.appName,
      },
    });
    const fused = fuseCandidateEvidence(
      result.candidates,
      result.candidateSource ?? "none",
      screenshot.capturedAt,
    );
    const rankedCandidates = rankScreenCandidates(
      fused.candidates,
      goal,
      MAX_LIVE_GUIDANCE_CANDIDATES,
    );

    return {
      ...result,
      ...fused,
      candidates: rankedCandidates,
      candidateEvidence: {
        ...fused.candidateEvidence,
        returnedCount: rankedCandidates.length,
      },
    };
  } catch (error) {
    return {
      candidates: [],
      candidateSource: "unavailable",
      candidateError: error instanceof Error ? error.message : String(error),
    };
  }
}
