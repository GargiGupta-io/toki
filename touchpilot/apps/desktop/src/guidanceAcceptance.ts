import type {
  GuidanceProviderResponse,
  GuidanceResult,
  SafetyPolicyDecision,
} from "@toki/shared";

export function getAcceptedGuidanceResult(
  response: GuidanceProviderResponse,
  safetyDecision: SafetyPolicyDecision,
): GuidanceResult | null {
  const safetyAllowsGuidance =
    safetyDecision.action === "allow" || safetyDecision.action === "confirm";
  const target = response.result?.step?.target;

  if (
    !safetyAllowsGuidance ||
    response.validation?.valid !== true ||
    target == null ||
    response.debug?.targetVerification?.status !== "accepted"
  ) {
    return null;
  }

  return response.result ?? null;
}

export function canRevealGuidanceTarget(
  safetyDecision: SafetyPolicyDecision | null,
  targetRevealAcknowledged: boolean,
): boolean {
  if (safetyDecision?.action === "allow") {
    return true;
  }

  return safetyDecision?.action === "confirm" && targetRevealAcknowledged;
}

export function getRenderableGuidanceResult(
  response: GuidanceProviderResponse,
  safetyDecision: SafetyPolicyDecision,
  targetRevealAcknowledged = false,
): GuidanceResult | null {
  const acceptedResult = getAcceptedGuidanceResult(response, safetyDecision);

  return acceptedResult != null &&
    canRevealGuidanceTarget(safetyDecision, targetRevealAcknowledged)
    ? acceptedResult
    : null;
}
