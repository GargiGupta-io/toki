import { invoke } from "@tauri-apps/api/core";
import type {
  PointerLockSnapshot,
  ScreenCandidate,
} from "@toki/shared";

export type PointerExplanationQuestionKind =
  | "identity"
  | "effect"
  | "disabled"
  | "explain";

export type PointerExplanationIntent = {
  normalizedTranscript: string;
  questionKind: PointerExplanationQuestionKind;
  deictic: boolean;
  explicitObject: string | null;
};

export type PointerEvidenceDecision =
  | { status: "none"; candidate: null; nearby: ScreenCandidate[] }
  | { status: "unique"; candidate: ScreenCandidate; nearby: ScreenCandidate[] }
  | { status: "ambiguous"; candidate: null; nearby: ScreenCandidate[] };

export type PointerExplanationImageEvidence = {
  candidateId: string;
  label: string;
  role: ScreenCandidate["role"];
  source: ScreenCandidate["source"] | "unknown";
  imageRect: { x: number; y: number; width: number; height: number };
};

export type PointerExplanationProviderRequest = {
  transcript: string;
  intent: PointerExplanationIntent;
  lock: PointerLockSnapshot;
  appName: string | null;
  image: {
    imageBase64: string;
    format: "png" | "jpeg";
    width: number;
    height: number;
  };
  lockedPoint: { x: number; y: number };
  focusRegion: { x: number; y: number; width: number; height: number };
  structuredEvidence: PointerExplanationImageEvidence | null;
};

export type PointerExplanationProviderDebug = {
  rawAnswer?: string;
  providerName?: string;
  lockedPoint: { x: number; y: number };
  focusRegion: { x: number; y: number; width: number; height: number };
  structuredCandidateId?: string;
};

export type PointerExplanationState = {
  id: string;
  status: "processing" | "grounded" | "clarify";
  transcript: string;
  lock: PointerLockSnapshot | null;
  label: string;
  message: string;
  confidence: number | null;
  supportingEvidence: string[];
  riskWarning: string | null;
  reason: string | null;
  debug: PointerExplanationProviderDebug | null;
  updatedAt: string;
};

export type PointerExplanationProviderResult =
  | {
      status: "grounded";
      label: string;
      explanation: string;
      confidence: number;
      supportingEvidence: string[];
      riskWarning: string | null;
      disabled: boolean;
      debug: PointerExplanationProviderDebug;
    }
  | {
      status: "clarify";
      reason:
        | "provider_unavailable"
        | "provider_invalid"
        | "provider_no_match"
        | "low_confidence"
        | "generic_label"
        | "moved_target"
        | "spoken_object_conflict"
        | "unsupported_evidence";
      message: string;
      debug: PointerExplanationProviderDebug;
    };

type PointerExplanationClarifyReason = Extract<
  PointerExplanationProviderResult,
  { status: "clarify" }
>["reason"];

type NativeInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type NativeCodexVisionResponse = {
  rawAnswer: string;
  providerName: string;
  durationMs: number;
};

type RawPointerExplanationResponse = {
  found?: boolean;
  label?: string;
  explanation?: string;
  confidence?: number;
  evidence?: string[];
  riskWarning?: string;
  disabled?: boolean;
  target?: {
    centerX?: number;
    centerY?: number;
    width?: number;
    height?: number;
  } | null;
};

export type PointerExplanationProviderOptions = {
  invokeImpl?: NativeInvoke;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_GROUNDED_CONFIDENCE = 0.7;
const NEARBY_PADDING_PX = 12;
const AMBIGUITY_DISTANCE_DELTA_PX = 4;
const TARGET_POINT_TOLERANCE_PX = 2;

const POINTER_EXPLANATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "found",
    "label",
    "explanation",
    "confidence",
    "evidence",
    "riskWarning",
    "disabled",
    "target",
  ],
  properties: {
    found: { type: "boolean" },
    label: { type: "string" },
    explanation: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    riskWarning: { type: "string" },
    disabled: { type: "boolean" },
    target: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["centerX", "centerY", "width", "height"],
          properties: {
            centerX: { type: "number" },
            centerY: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
        },
      ],
    },
  },
} as const;

const GENERIC_LABEL_TOKENS = new Set([
  "button",
  "control",
  "feature",
  "icon",
  "item",
  "menu",
  "option",
  "tab",
  "target",
  "this",
  "that",
  "visual",
]);

const EXPLICIT_OBJECT_FILLER = new Set([
  "a",
  "an",
  "the",
  "please",
  "button",
  "control",
  "feature",
  "icon",
  "item",
  "menu",
  "option",
  "tab",
]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedTokens(value: string, ignored = GENERIC_LABEL_TOKENS): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 0 && !ignored.has(token));
}

function semanticLabelsMatch(left: string, right: string): boolean {
  const leftTokens = new Set(normalizedTokens(left));
  const rightTokens = new Set(normalizedTokens(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return true;
  }

  return [...leftTokens].some((token) => rightTokens.has(token));
}

export function hasSpecificPointerEvidenceLabel(label: string): boolean {
  return normalizedTokens(label).some((token) => token.length >= 2);
}

function extractExplicitObject(normalized: string): string | null {
  const explicitPatterns = [
    /^(?:please\s+)?explain\s+(?:the\s+)?(.+?)(?:\s+to\s+me)?[?.!]*$/i,
    /^(?:please\s+)?tell\s+me\s+(?:about|what)\s+(?:the\s+)?(.+?)(?:\s+does)?[?.!]*$/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern)?.[1];
    if (match == null) {
      continue;
    }

    const tokens = match
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(
        (token) =>
          token.length > 0 &&
          !EXPLICIT_OBJECT_FILLER.has(token) &&
          token !== "this" &&
          token !== "that",
      );
    if (tokens.length > 0) {
      return tokens.join(" ");
    }
  }

  return null;
}

export function classifyPointerExplanationCommand(
  transcript: string,
): PointerExplanationIntent | null {
  const normalizedTranscript = normalizeWhitespace(transcript);
  const normalized = normalizedTranscript.toLowerCase();
  const deictic = /\b(this|that|here)\b/.test(normalized);
  const isExplanation =
    /^(?:please\s+)?(?:can\s+you\s+)?explain\b/.test(normalized) ||
    /^(?:please\s+)?tell\s+me\s+(?:about|what)\b/.test(normalized) ||
    /^what\s+(?:is|does|will|happens?)\b/.test(normalized) ||
    /^why\s+is\b/.test(normalized);

  if (!isExplanation) {
    return null;
  }

  const questionKind: PointerExplanationQuestionKind =
    /\bdisabled\b/.test(normalized)
      ? "disabled"
      : /\b(?:happen|happens|use|click|do|does)\b/.test(normalized)
        ? "effect"
        : /^what\s+is\b/.test(normalized)
          ? "identity"
          : "explain";

  return {
    normalizedTranscript,
    questionKind,
    deictic,
    explicitObject: extractExplicitObject(normalizedTranscript),
  };
}

export function shouldRoutePointerExplanation(
  intent: PointerExplanationIntent | null,
  hasFrozenGestureLock: boolean,
): boolean {
  return intent != null && (hasFrozenGestureLock || intent.deictic);
}

function distanceToCandidate(
  candidate: ScreenCandidate,
  point: { x: number; y: number },
): { distance: number; contains: boolean } {
  const right = candidate.x + candidate.width;
  const bottom = candidate.y + candidate.height;
  const contains =
    point.x >= candidate.x &&
    point.x <= right &&
    point.y >= candidate.y &&
    point.y <= bottom;
  const dx = Math.max(candidate.x - point.x, 0, point.x - right);
  const dy = Math.max(candidate.y - point.y, 0, point.y - bottom);

  return { distance: Math.hypot(dx, dy), contains };
}

function candidateSemanticKey(candidate: ScreenCandidate): string {
  const tokens = normalizedTokens(candidate.label);
  return tokens.length > 0 ? tokens.join(" ") : candidate.label.trim().toLowerCase();
}

export function getPointerEvidenceDecision(
  candidates: ScreenCandidate[],
  point: { x: number; y: number },
): PointerEvidenceDecision {
  const nearby = candidates
    .map((candidate) => ({ candidate, ...distanceToCandidate(candidate, point) }))
    .filter(({ distance }) => distance <= NEARBY_PADDING_PX)
    .sort((left, right) => {
      if (left.contains !== right.contains) {
        return left.contains ? -1 : 1;
      }
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.candidate.width * left.candidate.height - right.candidate.width * right.candidate.height;
    });

  if (nearby.length === 0) {
    return { status: "none", candidate: null, nearby: [] };
  }

  const semanticGroups = new Map<string, typeof nearby>();
  for (const entry of nearby) {
    const key = candidateSemanticKey(entry.candidate);
    semanticGroups.set(key, [...(semanticGroups.get(key) ?? []), entry]);
  }
  const representatives = [...semanticGroups.values()]
    .map((group) => group[0])
    .sort((left, right) => {
      if (left.contains !== right.contains) {
        return left.contains ? -1 : 1;
      }
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.candidate.width * left.candidate.height - right.candidate.width * right.candidate.height;
    });
  const first = representatives[0];
  const second = representatives[1];
  const ambiguous =
    second != null &&
    first.contains === second.contains &&
    Math.abs(first.distance - second.distance) <= AMBIGUITY_DISTANCE_DELTA_PX;

  if (ambiguous) {
    return {
      status: "ambiguous",
      candidate: null,
      nearby: representatives.map(({ candidate }) => candidate),
    };
  }

  return {
    status: "unique",
    candidate: first.candidate,
    nearby: nearby.map(({ candidate }) => candidate),
  };
}

export function explicitObjectConflictsWithLabel(
  explicitObject: string | null,
  label: string,
): boolean {
  return explicitObject != null && !semanticLabelsMatch(explicitObject, label);
}

function createPointerExplanationPrompt(
  request: PointerExplanationProviderRequest,
): string {
  const evidence = request.structuredEvidence;
  const evidenceSummary =
    evidence == null
      ? "No unique OCR/accessibility/DOM candidate was available at the locked point. Use only current screenshot pixels inside the focus region."
      : `A current structured candidate overlaps the point: id ${JSON.stringify(
          evidence.candidateId,
        )}, label ${JSON.stringify(evidence.label)}, role ${evidence.role}/${
          evidence.source
        }, image box ${evidence.imageRect.x},${evidence.imageRect.y},${
          evidence.imageRect.width
        }x${evidence.imageRect.height}.`;
  const explicitObject =
    request.intent.explicitObject == null
      ? "The user did not name a separate object."
      : `The user explicitly named ${JSON.stringify(
          request.intent.explicitObject,
        )}. It must describe the control at the locked point; otherwise return found=false.`;

  return [
    "You are Toki's locked-pointer explanation component.",
    "Do not use tools or inspect the filesystem. Analyze only the attached current screenshot.",
    "Return only the JSON object required by the output schema.",
    "Explain the control or feature under the exact locked point. Do not choose a nearby substitute and do not plan a task.",
    "If the point is empty, stale-looking, between two controls, visually ambiguous, or conflicts with the user's named object, return found=false with confidence at or below 0.45.",
    "Never claim that Toki clicked, activated, or changed anything. Toki only explains.",
    "When found=true, target must tightly cover the same control and must contain the exact locked point.",
    "Use a specific visible label. Never use generic labels such as icon, button, control, feature, or visual target.",
    "Keep explanation to one or two short sentences. Include a short risk warning only when using the control could change data, permissions, account state, playback, or settings.",
    "For a disabled-control question, explain only what current visual evidence supports; do not invent why it is disabled.",
    "Return target coordinates in attached-image pixels.",
    "",
    `Transcript: ${request.transcript}`,
    `Question kind: ${request.intent.questionKind}`,
    `Active app: ${request.appName ?? "unknown"}`,
    `Image size: ${request.image.width}x${request.image.height}`,
    `Exact locked point: ${request.lockedPoint.x},${request.lockedPoint.y}`,
    `Bounded focus region: ${request.focusRegion.x},${request.focusRegion.y},${request.focusRegion.width}x${request.focusRegion.height}`,
    explicitObject,
    evidenceSummary,
  ].join("\n");
}

function parseRawPointerExplanation(text: string): RawPointerExplanationResponse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("pointer explanation provider did not return a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as RawPointerExplanationResponse;
}

function targetContainsLockedPoint(
  target: NonNullable<RawPointerExplanationResponse["target"]>,
  point: { x: number; y: number },
): boolean {
  const centerX = Number(target.centerX);
  const centerY = Number(target.centerY);
  const width = Number(target.width);
  const height = Number(target.height);

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return false;
  }

  return (
    point.x >= centerX - width / 2 - TARGET_POINT_TOLERANCE_PX &&
    point.x <= centerX + width / 2 + TARGET_POINT_TOLERANCE_PX &&
    point.y >= centerY - height / 2 - TARGET_POINT_TOLERANCE_PX &&
    point.y <= centerY + height / 2 + TARGET_POINT_TOLERANCE_PX
  );
}

function clarify(
  request: PointerExplanationProviderRequest,
  reason: PointerExplanationClarifyReason,
  message: string,
  rawAnswer?: string,
  providerName?: string,
): PointerExplanationProviderResult {
  return {
    status: "clarify",
    reason,
    message,
    debug: {
      rawAnswer,
      providerName,
      lockedPoint: request.lockedPoint,
      focusRegion: request.focusRegion,
      structuredCandidateId: request.structuredEvidence?.candidateId,
    },
  };
}

export function verifyPointerExplanationResponse(
  rawAnswer: string,
  request: PointerExplanationProviderRequest,
  providerName = "codex-subscription",
): PointerExplanationProviderResult {
  let parsed: RawPointerExplanationResponse;
  try {
    parsed = parseRawPointerExplanation(rawAnswer);
  } catch {
    return clarify(
      request,
      "provider_invalid",
      "I couldn't verify what is under the locked point. Please lock it again.",
      rawAnswer,
      providerName,
    );
  }

  const confidence = Math.min(Math.max(Number(parsed.confidence), 0), 1);
  const label = normalizeWhitespace(parsed.label ?? "").slice(0, 80);
  const explanation = normalizeWhitespace(parsed.explanation ?? "").slice(0, 320);
  const supportingEvidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
    .map((item) => normalizeWhitespace(String(item)).slice(0, 180))
    .filter(Boolean)
    .slice(0, 4);

  if (!parsed.found || parsed.target == null) {
    return clarify(
      request,
      "provider_no_match",
      "I can't confirm one control at that locked point. Lock the control again more precisely.",
      rawAnswer,
      providerName,
    );
  }
  if (confidence < MIN_GROUNDED_CONFIDENCE) {
    return clarify(
      request,
      "low_confidence",
      "I can't identify that control confidently from the current screen. Lock it again more precisely.",
      rawAnswer,
      providerName,
    );
  }
  if (!hasSpecificPointerEvidenceLabel(label)) {
    return clarify(
      request,
      "generic_label",
      "I found a shape at the point, but not enough meaning to explain it safely.",
      rawAnswer,
      providerName,
    );
  }
  if (!targetContainsLockedPoint(parsed.target, request.lockedPoint)) {
    return clarify(
      request,
      "moved_target",
      "The visual answer moved away from your locked point, so I refused it. Lock the intended control again.",
      rawAnswer,
      providerName,
    );
  }
  if (explicitObjectConflictsWithLabel(request.intent.explicitObject, label)) {
    return clarify(
      request,
      "spoken_object_conflict",
      "The control you named does not match the locked point. Lock the named control and try again.",
      rawAnswer,
      providerName,
    );
  }
  if (
    request.structuredEvidence != null &&
    hasSpecificPointerEvidenceLabel(request.structuredEvidence.label) &&
    !semanticLabelsMatch(request.structuredEvidence.label, label)
  ) {
    return clarify(
      request,
      "unsupported_evidence",
      "Current screen evidence disagrees about that locked control. Lock it again after the screen settles.",
      rawAnswer,
      providerName,
    );
  }
  if (explanation.length === 0 || supportingEvidence.length === 0) {
    return clarify(
      request,
      "unsupported_evidence",
      "The answer was not supported by enough current-screen evidence, so I refused it.",
      rawAnswer,
      providerName,
    );
  }

  return {
    status: "grounded",
    label,
    explanation,
    confidence,
    supportingEvidence,
    riskWarning: normalizeWhitespace(parsed.riskWarning ?? "").slice(0, 220) || null,
    disabled: parsed.disabled === true,
    debug: {
      rawAnswer,
      providerName,
      lockedPoint: request.lockedPoint,
      focusRegion: request.focusRegion,
      structuredCandidateId: request.structuredEvidence?.candidateId,
    },
  };
}

export async function requestCodexPointerExplanation(
  request: PointerExplanationProviderRequest,
  options: PointerExplanationProviderOptions = {},
): Promise<PointerExplanationProviderResult> {
  const invokeImpl = options.invokeImpl ?? (invoke as NativeInvoke);
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = (await invokeImpl("request_codex_vision_guidance", {
      request: {
        imageBase64: request.image.imageBase64,
        imageFormat: request.image.format,
        prompt: createPointerExplanationPrompt(request),
        outputSchema: JSON.stringify(POINTER_EXPLANATION_OUTPUT_SCHEMA),
        model: options.model?.trim() || null,
        timeoutMs,
      },
    })) as NativeCodexVisionResponse;

    return verifyPointerExplanationResponse(
      response.rawAnswer,
      request,
      response.providerName || "codex-subscription",
    );
  } catch (error) {
    return clarify(
      request,
      "provider_unavailable",
      `I couldn't read the locked control from the current screen: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
