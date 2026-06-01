import type { GuidanceRequest, GuidanceResult } from "@touchpilot/shared";

export function createMockGuidance(request: GuidanceRequest): GuidanceResult {
  const targetWidth = 112;
  const targetHeight = 48;
  const x = Math.round(request.screen.display.width / 2);
  const y = Math.round(request.screen.display.height / 2);

  return {
    mode: "guide",
    summary: `Mock guidance for: ${request.goal}`,
    step: {
      instruction: "Click the highlighted target to continue.",
      target: {
        label: "Mock target",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.82,
      risk: "safe_navigation",
      requiresConfirmation: false,
    },
  };
}
