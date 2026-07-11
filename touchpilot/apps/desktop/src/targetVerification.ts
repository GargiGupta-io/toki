import { validateGuidanceResult } from "@toki/ai";
import type {
  GuidanceProviderResponse,
  GuidanceRequest,
  ScreenCandidate,
  TargetBox,
  TargetEvidenceSource,
  TargetVerificationTrace,
} from "@toki/shared";

const MAX_CLICK_CUE_SIZE = 44;
const MIN_CLICK_CUE_SIZE = 24;
const SPATIAL_MATCH_PADDING = 12;
const VISION_TARGET_ID = "ollama-vision-target";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCenter(target: TargetBox) {
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

function isValidBox(target: TargetBox, request: GuidanceRequest) {
  return (
    target.label.trim().length > 0 &&
    Number.isFinite(target.x) &&
    Number.isFinite(target.y) &&
    Number.isFinite(target.width) &&
    Number.isFinite(target.height) &&
    target.width > 0 &&
    target.height > 0 &&
    target.x >= 0 &&
    target.y >= 0 &&
    target.x + target.width <= request.screen.display.width &&
    target.y + target.height <= request.screen.display.height
  );
}

function getCandidateSource(candidate: ScreenCandidate): TargetEvidenceSource {
  if (candidate.source != null) {
    return candidate.source;
  }

  if (candidate.role.startsWith("dom_")) {
    return "dom";
  }

  if (candidate.role === "ocr_text") {
    return "ocr";
  }

  if (candidate.role === "manual") {
    return "manual";
  }

  return "accessibility";
}

function isUnavailableCandidate(candidate: ScreenCandidate) {
  return (
    candidate.metadata?.visible === false ||
    candidate.metadata?.hidden === true ||
    candidate.metadata?.disabled === true
  );
}

function hasIntentConflict(candidate: ScreenCandidate) {
  return candidate.rank?.reasons.some((reason) =>
    reason.startsWith("intent-action-conflict:"),
  ) ?? false;
}

function isBroadWeakCandidate(candidate: ScreenCandidate) {
  const nativeRole = String(candidate.metadata?.nativeRole ?? "").toLowerCase();
  const actionRole = /(button|link|menuitem|checkbox|radio|textbox|textfield|tab)/;
  const weakRole = /(window|application|group|toolbar|menubar|region)/;

  return (
    candidate.width > 500 ||
    candidate.height > 180 ||
    (weakRole.test(nativeRole) && !actionRole.test(nativeRole))
  );
}

function distanceToRect(point: { x: number; y: number }, rect: TargetBox) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));

  return Math.hypot(dx, dy);
}

function sourceTrust(source: TargetEvidenceSource) {
  switch (source) {
    case "dom":
      return 40;
    case "accessibility":
      return 35;
    case "manual":
      return 30;
    case "ocr":
      return 10;
    case "vision":
      return 0;
  }
}

function findSpatialCandidate(
  target: TargetBox,
  candidates: ScreenCandidate[],
  request: GuidanceRequest,
) {
  const center = getCenter(target);

  return candidates
    .filter(
      (candidate) =>
        isValidBox(candidate, request) &&
        !isUnavailableCandidate(candidate) &&
        !hasIntentConflict(candidate) &&
        !isBroadWeakCandidate(candidate),
    )
    .map((candidate) => {
      const distance = distanceToRect(center, candidate);
      const source = getCandidateSource(candidate);

      return {
        candidate,
        distance,
        score:
          sourceTrust(source) +
          (candidate.rank?.score ?? 0) -
          distance * 2,
      };
    })
    .filter(({ distance }) => distance <= SPATIAL_MATCH_PADDING)
    .sort((left, right) => right.score - left.score)[0]?.candidate;
}

function createClickCue(
  clickPoint: { x: number; y: number },
  reference: TargetBox,
  request: GuidanceRequest,
  label: string,
  candidateId?: string,
): TargetBox {
  const display = request.screen.display;
  const maximumSize = Math.min(
    MAX_CLICK_CUE_SIZE,
    display.width,
    display.height,
  );
  const minimumSize = Math.min(MIN_CLICK_CUE_SIZE, maximumSize);
  const size = Math.round(
    clamp(Math.min(reference.width, reference.height), minimumSize, maximumSize),
  );

  return {
    candidateId,
    label,
    x: Math.round(clamp(clickPoint.x - size / 2, 0, display.width - size)),
    y: Math.round(clamp(clickPoint.y - size / 2, 0, display.height - size)),
    width: size,
    height: size,
  };
}

function rejectTarget(
  response: GuidanceProviderResponse,
  target: TargetBox,
  trace: Omit<TargetVerificationTrace, "status" | "inputTarget" | "reasons">,
  reason: string,
): GuidanceProviderResponse {
  return {
    ...response,
    mode: "unavailable",
    result: undefined,
    error: `Target verification failed: ${reason}`,
    validation: {
      valid: false,
      issues: [{ path: "step.target", message: reason }],
    },
    debug: {
      ...response.debug,
      targetVerification: {
        ...trace,
        status: "rejected",
        inputTarget: target,
        reasons: [reason],
      },
    },
  };
}

export function verifyGuidanceTarget(
  response: GuidanceProviderResponse,
  request: GuidanceRequest,
): GuidanceProviderResponse {
  const result = response.result;
  const step = result?.step;
  const inputTarget = step?.target;

  if (result == null || step == null || inputTarget == null) {
    return response;
  }

  if (!isValidBox(inputTarget, request)) {
    return rejectTarget(
      response,
      inputTarget,
      { source: "vision", match: "vision_only" },
      "target geometry is outside the active display",
    );
  }

  const candidates = request.screen.candidates ?? [];
  const claimedCandidateId = inputTarget.candidateId?.trim();
  const hasRealCandidateClaim =
    claimedCandidateId != null &&
    claimedCandidateId.length > 0 &&
    claimedCandidateId !== VISION_TARGET_ID;
  const directCandidate = hasRealCandidateClaim
    ? candidates.find((candidate) => candidate.id === claimedCandidateId)
    : undefined;

  if (hasRealCandidateClaim && directCandidate == null) {
    return rejectTarget(
      response,
      inputTarget,
      {
        source: "vision",
        match: "candidate_id",
        candidateId: claimedCandidateId,
      },
      `claimed candidate ${claimedCandidateId} is not present in the current screen evidence`,
    );
  }

  const candidate =
    directCandidate ?? findSpatialCandidate(inputTarget, candidates, request);
  const match = directCandidate
    ? "candidate_id"
    : candidate
      ? "spatial_candidate"
      : "vision_only";
  const source = candidate == null ? "vision" : getCandidateSource(candidate);

  if (candidate != null) {
    const trace = {
      source,
      match,
      candidateId: candidate.id,
      candidateRole: candidate.role,
    } as const;

    if (!isValidBox(candidate, request)) {
      return rejectTarget(
        response,
        inputTarget,
        trace,
        `candidate ${candidate.id} has invalid or off-display geometry`,
      );
    }

    if (isUnavailableCandidate(candidate)) {
      return rejectTarget(
        response,
        inputTarget,
        trace,
        `candidate ${candidate.id} is hidden or disabled`,
      );
    }

    if (hasIntentConflict(candidate)) {
      return rejectTarget(
        response,
        inputTarget,
        trace,
        `candidate ${candidate.id} conflicts with the current objective`,
      );
    }

    if (isBroadWeakCandidate(candidate)) {
      return rejectTarget(
        response,
        inputTarget,
        trace,
        `candidate ${candidate.id} is a broad container rather than a precise control`,
      );
    }
  }

  const useCandidateCenter = candidate != null && source !== "ocr";
  const clickPoint = useCandidateCenter
    ? getCenter(candidate)
    : getCenter(inputTarget);
  const reference = useCandidateCenter ? candidate : inputTarget;
  const label = directCandidate?.label ?? inputTarget.label;
  const verifiedTarget = createClickCue(
    clickPoint,
    reference,
    request,
    label,
    candidate?.id,
  );
  const reasons = [
    "target-inside-display",
    match === "candidate_id"
      ? "candidate-id-match"
      : match === "spatial_candidate"
        ? "candidate-spatial-match"
        : "vision-only-target",
    useCandidateCenter ? "candidate-center-click-point" : "provider-center-click-point",
    `evidence-source:${source}`,
  ];
  const verifiedResult = {
    ...result,
    step: {
      ...step,
      target: verifiedTarget,
    },
  };
  const validation = validateGuidanceResult(verifiedResult);

  if (!validation.valid) {
    return rejectTarget(
      response,
      inputTarget,
      {
        source,
        match,
        candidateId: candidate?.id,
        candidateRole: candidate?.role,
        clickPoint,
      },
      validation.issues[0]?.message ?? "verified target is invalid",
    );
  }

  return {
    ...response,
    result: verifiedResult,
    validation,
    debug: {
      ...response.debug,
      targetVerification: {
        status: "accepted",
        source,
        match,
        candidateId: candidate?.id,
        candidateRole: candidate?.role,
        clickPoint: {
          x: Math.round(clickPoint.x),
          y: Math.round(clickPoint.y),
        },
        inputTarget,
        verifiedTarget,
        reasons,
      },
    },
  };
}
