import type { GuidanceRequest, GuidanceResult } from "@toki/shared";

import { fixtureModeNotice } from "./config";

/**
 * Placeholder responses used until provider credentials exist.
 *
 * These are shaped exactly like real answers so the desktop client's whole path
 * can be exercised — request, transport, validation, rendering — with nothing
 * bought and nothing deployed. What they must never do is pass for real
 * guidance, so every one of them says plainly that it is a placeholder and
 * asks for no confirmation and no click.
 */

export function createFixtureGuidance(request: GuidanceRequest): GuidanceResult {
  return {
    mode: "clarify",
    summary: fixtureModeNotice,
    step: {
      instruction: `Toki received the goal "${request.goal}" and a ${
        request.screen.screenshotPayload?.imageWidth ?? "?"
      }×${
        request.screen.screenshotPayload?.imageHeight ?? "?"
      } screenshot. Configure provider credentials to get real guidance.`,
      // No target: a placeholder must never point at anything on screen, or a
      // fixture deployment would send users clicking arbitrary coordinates.
      confidence: 0,
      risk: "safe_navigation",
      requiresConfirmation: false,
    },
  };
}

export function createFixtureTranscript(): string {
  return "(fixture mode: speech was received but not transcribed)";
}
