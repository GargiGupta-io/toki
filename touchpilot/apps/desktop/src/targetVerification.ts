import { validateGuidanceResult } from "@toki/ai";
import type {
  GuidanceCommandIntent,
  GuidanceProviderResponse,
  GuidanceRequest,
  RawProviderOutputTrace,
  ScreenCandidate,
  TargetBox,
  TargetEvidenceSource,
  TargetSupportingEvidence,
  TargetVerificationTrace,
} from "@toki/shared";
import {
  evaluateCandidateSemanticMatch,
  getCandidateSemanticText,
  interpretCommandIntent,
  type CandidateSemanticMatch,
} from "./candidateIntent";
import { getGuidanceLocalizationObjective } from "./guidanceTaskPlanning";

const MAX_CLICK_CUE_SIZE = 44;
const MIN_CLICK_CUE_SIZE = 24;
const SPATIAL_MATCH_PADDING = 12;
const VISION_TARGET_ID = "vision-model-target";
const GROUNDING_THRESHOLD = 70;
const VISION_ONLY_MIN_CONFIDENCE = 0.72;

const GENERIC_TARGET_LABELS = new Set([
  "",
  "button",
  "button label",
  "control",
  "exact visible target",
  "icon",
  "plus",
  "plus icon",
  "target",
  "toolbar item",
  "ui target",
  "unlabeled icon",
  "unlabelled icon",
  "visible control",
  "visible target",
  "visible target control",
  "vision target",
  "visual description",
]);

const EVIDENCE_LABEL_KEYS = [
  "ariaLabel",
  "nativeName",
  "nativeDescription",
  "nativeHelp",
  "title",
  "placeholder",
  "nativeValue",
  "providerLabel",
] as const;

type StructuredEvidenceSource = Exclude<TargetEvidenceSource, "vision">;
type VerificationMatch = TargetVerificationTrace["match"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isGenericTargetLabel(value: string | undefined) {
  const normalized = normalizeLabel(value);

  return (
    GENERIC_TARGET_LABELS.has(normalized) ||
    !/[a-z0-9]/.test(normalized) ||
    normalized.includes("button label") ||
    normalized.includes("visual description") ||
    /^(unlabelled|unlabeled|unknown|generic)\b/.test(normalized)
  );
}

function getCenter(target: TargetBox) {
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

function hasValidGeometry(target: TargetBox, request: GuidanceRequest) {
  return (
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

function getCandidateSource(candidate: ScreenCandidate): StructuredEvidenceSource {
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
  return (
    candidate.rank?.reasons.some(
      (reason) =>
        reason.startsWith("intent-action-conflict:") ||
        reason.startsWith("intent-object-conflict:"),
    ) ?? false
  );
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

function sourceTrust(source: StructuredEvidenceSource) {
  switch (source) {
    case "dom":
      return 20;
    case "accessibility":
      return 18;
    case "manual":
      return 16;
    case "ocr":
      return 12;
  }
}

function getResolvedCandidateLabel(candidate: ScreenCandidate) {
  const values = [
    candidate.label,
    ...EVIDENCE_LABEL_KEYS.map((key) => candidate.metadata?.[key]).filter(
      (value): value is string => typeof value === "string",
    ),
  ];

  return (
    values.map((value) => value.trim()).find((value) => !isGenericTargetLabel(value)) ??
    candidate.label.trim()
  );
}

function findSpatialCandidate(
  target: TargetBox,
  candidates: ScreenCandidate[],
  request: GuidanceRequest,
  objective: string,
) {
  const center = getCenter(target);

  return candidates
    .filter(
      (candidate) =>
        hasValidGeometry(candidate, request) &&
        !isUnavailableCandidate(candidate) &&
        !hasIntentConflict(candidate) &&
        !isBroadWeakCandidate(candidate),
    )
    .map((candidate) => {
      const distance = distanceToRect(center, candidate);
      const source = getCandidateSource(candidate);
      const semantic = evaluateCandidateSemanticMatch(candidate, objective);

      return {
        candidate,
        distance,
        semantic,
        score:
          semantic.score +
          sourceTrust(source) +
          Math.max(0, Math.min(10, (candidate.rank?.score ?? 0) / 10)) -
          distance * 2,
      };
    })
    .filter(({ distance }) => distance <= SPATIAL_MATCH_PADDING)
    .sort((left, right) => {
      if (left.semantic.accepted !== right.semantic.accepted) {
        return left.semantic.accepted ? -1 : 1;
      }

      return right.score - left.score;
    })[0];
}

function createClickCue(
  clickPoint: { x: number; y: number },
  reference: TargetBox,
  request: GuidanceRequest,
  label: string,
  candidateId: string,
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

function toCommandIntent(
  semantic: CandidateSemanticMatch | null,
  objective: string,
): GuidanceCommandIntent {
  const command = semantic?.command ?? interpretCommandIntent(objective);

  return {
    objective: command.objective,
    action: command.action,
    object: command.object,
    actions: command.actions,
    objects: command.objects,
  };
}

function createSupportingEvidence(
  candidate: ScreenCandidate,
  semantic: CandidateSemanticMatch,
  resolvedLabel: string,
): TargetSupportingEvidence {
  return {
    candidateId: candidate.id,
    label: candidate.label,
    resolvedLabel,
    role: candidate.role,
    source: getCandidateSource(candidate),
    semanticText: getCandidateSemanticText(candidate),
    matchedActions: semantic.matchedActions,
    matchedObjects: semantic.matchedObjects,
    rankScore: candidate.rank?.score,
    rankReasons: candidate.rank?.reasons ?? [],
  };
}

function createVisionEvidenceCandidate(
  response: GuidanceProviderResponse,
  target: TargetBox,
): ScreenCandidate {
  const providerReason =
    response.debug?.providerOutput?.reason ?? response.result?.summary ?? "";

  return {
    id: VISION_TARGET_ID,
    candidateId: VISION_TARGET_ID,
    label: target.label,
    role: "vision_control",
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    metadata: {
      nativeDescription: providerReason,
    },
  };
}

function createVisionSupportingEvidence(
  candidate: ScreenCandidate,
  semantic: CandidateSemanticMatch,
  resolvedLabel: string,
): TargetSupportingEvidence {
  return {
    candidateId: candidate.id,
    label: candidate.label,
    resolvedLabel,
    role: candidate.role,
    source: "vision",
    semanticText: getCandidateSemanticText(candidate),
    matchedActions: semantic.matchedActions,
    matchedObjects: semantic.matchedObjects,
    rankReasons: [],
  };
}

function hasExplicitSemanticConflict(semantic: CandidateSemanticMatch) {
  const actionConflict =
    semantic.command.action != null &&
    semantic.candidateActions.length > 0 &&
    !semantic.candidateActions.includes(semantic.command.action);
  const objectConflict =
    semantic.command.object != null &&
    semantic.candidateObjects.length > 0 &&
    !semantic.candidateObjects.includes(semantic.command.object);

  return actionConflict || objectConflict;
}

function createProviderSemanticAugmentation(
  response: GuidanceProviderResponse,
  candidate: ScreenCandidate,
  semantic: CandidateSemanticMatch,
  objective: string,
) {
  const providerOutput = response.debug?.providerOutput;
  const providerLabel = providerOutput?.label?.trim() ?? "";
  const providerReason = providerOutput?.reason?.trim() ?? "";
  const confidence =
    providerOutput?.confidence ?? response.result?.step?.confidence ?? 0;
  const hasCurrentImageTrace =
    response.debug?.vision != null && providerOutput?.target != null;

  if (
    !hasCurrentImageTrace ||
    !isGenericTargetLabel(candidate.label) ||
    isGenericTargetLabel(providerLabel) ||
    providerReason.length < 8 ||
    !Number.isFinite(confidence) ||
    confidence < VISION_ONLY_MIN_CONFIDENCE ||
    hasExplicitSemanticConflict(semantic)
  ) {
    return null;
  }

  const augmentedCandidate: ScreenCandidate = {
    ...candidate,
    metadata: {
      ...(candidate.metadata ?? {}),
      providerLabel,
      providerReason,
    },
  };
  const augmentedSemantic = evaluateCandidateSemanticMatch(
    augmentedCandidate,
    objective,
  );

  if (!augmentedSemantic.accepted) {
    return null;
  }

  return {
    candidate: augmentedCandidate,
    semantic: augmentedSemantic,
  };
}

function preserveProviderOutput(
  response: GuidanceProviderResponse,
  target: TargetBox,
): RawProviderOutputTrace {
  const step = response.result?.step;

  return {
    rawAnswer: response.debug?.providerOutput?.rawAnswer,
    label: response.debug?.providerOutput?.label ?? target.label,
    reason: response.debug?.providerOutput?.reason ?? response.result?.summary,
    confidence: response.debug?.providerOutput?.confidence ?? step?.confidence,
    risk: response.debug?.providerOutput?.risk ?? step?.risk,
    target: response.debug?.providerOutput?.target ?? {
      candidateId: target.candidateId,
      label: target.label,
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    },
  };
}

function calculateGroundingScore(
  candidate: ScreenCandidate,
  semantic: CandidateSemanticMatch,
  match: Exclude<VerificationMatch, "vision_only">,
) {
  const rankContribution = Math.max(
    0,
    Math.min(10, (candidate.rank?.score ?? 0) / 10),
  );
  const matchContribution = match === "candidate_id" ? 10 : 6;

  return Math.round(
    clamp(
      semantic.score +
        sourceTrust(getCandidateSource(candidate)) +
        rankContribution +
        matchContribution,
      0,
      100,
    ),
  );
}

function calculateVisionOnlyGroundingScore(
  semantic: CandidateSemanticMatch,
  confidence: number,
) {
  const currentImageContribution = 10;
  const confidenceContribution = Math.round(confidence * 10);

  return Math.round(
    clamp(
      semantic.score + currentImageContribution + confidenceContribution,
      0,
      100,
    ),
  );
}

function rejectTarget(
  response: GuidanceProviderResponse,
  target: TargetBox,
  options: {
    objective: string;
    source: TargetEvidenceSource;
    match: VerificationMatch;
    candidate?: ScreenCandidate;
    semantic?: CandidateSemanticMatch | null;
    groundingScore?: number;
    reasons?: string[];
    reason: string;
  },
): GuidanceProviderResponse {
  const resolvedLabel = options.candidate
    ? getResolvedCandidateLabel(options.candidate)
    : "";
  const supportingEvidence =
    options.candidate != null && options.semantic != null
      ? options.source === "vision"
        ? createVisionSupportingEvidence(
            options.candidate,
            options.semantic,
            resolvedLabel,
          )
        : createSupportingEvidence(
            options.candidate,
            options.semantic,
            resolvedLabel,
          )
      : undefined;
  const reasons = [...(options.reasons ?? []), options.reason];
  const vision = response.debug?.vision;

  return {
    ...response,
    mode: "unavailable",
    result: undefined,
    error: `Target verification failed: ${options.reason}`,
    validation: {
      valid: false,
      issues: [{ path: "step.target", message: options.reason }],
    },
    debug: {
      ...response.debug,
      providerOutput: preserveProviderOutput(response, target),
      vision:
        vision == null
          ? undefined
          : {
              ...vision,
              mappedFinal: undefined,
            },
      targetVerification: {
        status: "rejected",
        source: options.source,
        match: options.match,
        candidateId: options.candidate?.id,
        candidateRole: options.candidate?.role,
        inputTarget: target,
        commandIntent: toCommandIntent(
          options.semantic ?? null,
          options.objective,
        ),
        supportingEvidence,
        groundingScore: options.groundingScore ?? 0,
        groundingThreshold: GROUNDING_THRESHOLD,
        groundingVerdict: "rejected",
        reasons,
      },
    },
  };
}

function semanticRejectionReason(semantic: CandidateSemanticMatch) {
  if (semantic.command.action == null) {
    // Said in terms of what happened rather than in terms of safety. The old
    // wording -- "the requested action could not be interpreted safely" --
    // described a refusal on grounds of danger for what is really "the thing I
    // found does not look like the thing you asked about", and it fired on most
    // ordinary phrasings.
    return `nothing on screen matched "${semantic.command.objective}"`;
  }

  if (!semantic.candidateActions.includes(semantic.command.action)) {
    return `current evidence does not match the requested action ${semantic.command.action}`;
  }

  if (
    semantic.command.object != null &&
    !semantic.candidateObjects.includes(semantic.command.object)
  ) {
    return `current evidence does not match the requested object ${semantic.command.object}`;
  }

  return "current evidence does not semantically match the command";
}

function verifyVisionOnlyTarget(
  response: GuidanceProviderResponse,
  request: GuidanceRequest,
  target: TargetBox,
  objective: string,
): GuidanceProviderResponse {
  const hasCurrentImageTrace =
    response.debug?.vision != null &&
    response.debug?.providerOutput?.target != null;
  const confidence =
    response.debug?.providerOutput?.confidence ??
    response.result?.step?.confidence ??
    0;
  const candidate = createVisionEvidenceCandidate(response, target);
  const semantic = evaluateCandidateSemanticMatch(candidate, objective);
  const resolvedLabel = getResolvedCandidateLabel(candidate);

  if (!hasCurrentImageTrace) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      reason:
        "target lacks a current-image localization trace and has no structured screen evidence",
    });
  }

  if (isGenericTargetLabel(target.label)) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      groundingScore: semantic.score,
      reasons: semantic.reasons,
      reason: `current-image target has only a blank or generic label (${target.label.trim() || "blank"})`,
    });
  }

  if (!Number.isFinite(confidence) || confidence < VISION_ONLY_MIN_CONFIDENCE) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      groundingScore: semantic.score,
      reasons: semantic.reasons,
      reason: `current-image confidence ${Math.round(confidence * 100)}% is below the required ${Math.round(VISION_ONLY_MIN_CONFIDENCE * 100)}%`,
    });
  }

  if (!semantic.accepted) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      groundingScore: semantic.score,
      reasons: semantic.reasons,
      reason: semanticRejectionReason(semantic),
    });
  }

  const groundingScore = calculateVisionOnlyGroundingScore(
    semantic,
    confidence,
  );

  if (groundingScore < GROUNDING_THRESHOLD) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      groundingScore,
      reasons: semantic.reasons,
      reason: `grounding score ${groundingScore} is below the required ${GROUNDING_THRESHOLD}`,
    });
  }

  const clickPoint = getCenter(target);
  const verifiedTarget = createClickCue(
    clickPoint,
    target,
    request,
    resolvedLabel,
    VISION_TARGET_ID,
  );
  const reasons = [
    "target-inside-display",
    "current-image-evidence",
    `provider-confidence:${confidence.toFixed(2)}`,
    ...semantic.reasons,
    "provider-center-click-point",
    "evidence-source:vision",
    `grounding-score:${groundingScore}`,
  ];
  const result = response.result;

  if (result?.step == null) {
    return response;
  }

  const verifiedResult = {
    ...result,
    step: {
      ...result.step,
      instruction: `Click ${resolvedLabel}.`,
      target: verifiedTarget,
    },
  };
  const validation = validateGuidanceResult(verifiedResult);

  if (!validation.valid) {
    return rejectTarget(response, target, {
      objective,
      source: "vision",
      match: "vision_only",
      candidate,
      semantic,
      groundingScore,
      reasons,
      reason: validation.issues[0]?.message ?? "verified target is invalid",
    });
  }

  const vision = response.debug?.vision;

  return {
    ...response,
    result: verifiedResult,
    validation,
    debug: {
      ...response.debug,
      providerOutput: preserveProviderOutput(response, target),
      vision:
        vision == null
          ? undefined
          : {
              ...vision,
              mappedFinal: verifiedTarget,
            },
      targetVerification: {
        status: "accepted",
        source: "vision",
        match: "vision_only",
        candidateId: VISION_TARGET_ID,
        candidateRole: candidate.role,
        clickPoint: {
          x: Math.round(clickPoint.x),
          y: Math.round(clickPoint.y),
        },
        inputTarget: target,
        verifiedTarget,
        commandIntent: toCommandIntent(semantic, objective),
        supportingEvidence: createVisionSupportingEvidence(
          candidate,
          semantic,
          resolvedLabel,
        ),
        groundingScore,
        groundingThreshold: GROUNDING_THRESHOLD,
        groundingVerdict: "grounded",
        reasons,
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

  const objective = getGuidanceLocalizationObjective(request);

  if (!hasValidGeometry(inputTarget, request)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source: "vision",
      match: "vision_only",
      reason: "target geometry is outside the active display",
    });
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
    return rejectTarget(response, inputTarget, {
      objective,
      source: "vision",
      match: "candidate_id",
      reason: `claimed candidate ${claimedCandidateId} is not present in the current screen evidence`,
    });
  }

  const spatialMatch =
    directCandidate == null
      ? findSpatialCandidate(inputTarget, candidates, request, objective)
      : undefined;
  const matchedCandidate = directCandidate ?? spatialMatch?.candidate;
  const baseSemantic =
    matchedCandidate == null
      ? null
      : spatialMatch?.candidate === matchedCandidate
        ? spatialMatch.semantic
        : evaluateCandidateSemanticMatch(matchedCandidate, objective);
  const providerAugmentation =
    matchedCandidate != null && baseSemantic != null
      ? createProviderSemanticAugmentation(
          response,
          matchedCandidate,
          baseSemantic,
          objective,
        )
      : null;
  const candidate = providerAugmentation?.candidate ?? matchedCandidate;
  const semantic = providerAugmentation?.semantic ?? baseSemantic;
  const match: VerificationMatch = directCandidate
    ? "candidate_id"
    : candidate
      ? "spatial_candidate"
      : "vision_only";
  const source = candidate == null ? "vision" : getCandidateSource(candidate);

  if (candidate == null) {
    return verifyVisionOnlyTarget(response, request, inputTarget, objective);
  }

  if (!hasValidGeometry(candidate, request)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      reason: `candidate ${candidate.id} has invalid or off-display geometry`,
    });
  }

  if (isUnavailableCandidate(candidate)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      reason: `candidate ${candidate.id} is hidden or disabled`,
    });
  }

  if (hasIntentConflict(candidate)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      reasons: semantic?.reasons,
      reason: `candidate ${candidate.id} conflicts with the current objective`,
    });
  }

  if (isBroadWeakCandidate(candidate)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      reason: `candidate ${candidate.id} is a broad container rather than a precise control`,
    });
  }

  if (semantic == null || !semantic.accepted) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      groundingScore: semantic?.score ?? 0,
      reasons: semantic?.reasons,
      reason:
        semantic == null
          ? "candidate semantics could not be evaluated"
          : semanticRejectionReason(semantic),
    });
  }

  const resolvedLabel = getResolvedCandidateLabel(candidate);

  if (isGenericTargetLabel(resolvedLabel)) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      groundingScore: semantic.score,
      reasons: semantic.reasons,
      reason: `candidate ${candidate.id} has only a blank or generic label (${resolvedLabel || "blank"})`,
    });
  }

  const groundedMatch = match as Exclude<VerificationMatch, "vision_only">;
  const groundingScore = calculateGroundingScore(
    candidate,
    semantic,
    groundedMatch,
  );

  if (groundingScore < GROUNDING_THRESHOLD) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match,
      candidate,
      semantic,
      groundingScore,
      reasons: semantic.reasons,
      reason: `grounding score ${groundingScore} is below the required ${GROUNDING_THRESHOLD}`,
    });
  }

  const useCandidateCenter = source !== "ocr";
  const clickPoint = useCandidateCenter
    ? getCenter(candidate)
    : getCenter(inputTarget);
  const reference = useCandidateCenter ? candidate : inputTarget;
  const verifiedTarget = createClickCue(
    clickPoint,
    reference,
    request,
    resolvedLabel,
    candidate.id,
  );
  const reasons = [
    "target-inside-display",
    groundedMatch === "candidate_id"
      ? "candidate-id-match"
      : "candidate-spatial-match",
    ...(providerAugmentation == null
      ? []
      : ["provider-semantic-augmentation"]),
    ...semantic.reasons,
    useCandidateCenter
      ? "candidate-center-click-point"
      : "provider-center-click-point",
    `evidence-source:${source}`,
    `grounding-score:${groundingScore}`,
  ];
  const verifiedResult = {
    ...result,
    step: {
      ...step,
      instruction: `Click ${resolvedLabel}.`,
      target: verifiedTarget,
    },
  };
  const validation = validateGuidanceResult(verifiedResult);

  if (!validation.valid) {
    return rejectTarget(response, inputTarget, {
      objective,
      source,
      match: groundedMatch,
      candidate,
      semantic,
      groundingScore,
      reasons,
      reason: validation.issues[0]?.message ?? "verified target is invalid",
    });
  }

  const supportingEvidence = createSupportingEvidence(
    candidate,
    semantic,
    resolvedLabel,
  );
  const vision = response.debug?.vision;

  return {
    ...response,
    result: verifiedResult,
    validation,
    debug: {
      ...response.debug,
      providerOutput: preserveProviderOutput(response, inputTarget),
      vision:
        vision == null
          ? undefined
          : {
              ...vision,
              mappedFinal: verifiedTarget,
            },
      targetVerification: {
        status: "accepted",
        source,
        match: groundedMatch,
        candidateId: candidate.id,
        candidateRole: candidate.role,
        clickPoint: {
          x: Math.round(clickPoint.x),
          y: Math.round(clickPoint.y),
        },
        inputTarget,
        verifiedTarget,
        commandIntent: toCommandIntent(semantic, objective),
        supportingEvidence,
        groundingScore,
        groundingThreshold: GROUNDING_THRESHOLD,
        groundingVerdict: "grounded",
        reasons,
      },
    },
  };
}
