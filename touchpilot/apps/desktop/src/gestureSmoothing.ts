import type {
  GestureClassification,
  GestureLabel,
  GestureThresholds,
} from "@toki/shared";

type GestureCandidate = Pick<
  GestureClassification,
  "label" | "confidence" | "sourceFrameId"
>;

export type GestureSmoothingState = {
  activeLabel: GestureLabel;
  holdStartedAt: number | null;
  cooldownUntil: number;
  lastRecognizedAt: number | null;
};

export const initialGestureSmoothingState: GestureSmoothingState = {
  activeLabel: "none",
  holdStartedAt: null,
  cooldownUntil: 0,
  lastRecognizedAt: null,
};

export function smoothGestureCandidate(
  previousState: GestureSmoothingState,
  candidate: GestureCandidate,
  thresholds: GestureThresholds,
  now: number,
): {
  state: GestureSmoothingState;
  classification: GestureClassification;
} {
  const cooldownRemainingMs = Math.max(0, previousState.cooldownUntil - now);

  if (cooldownRemainingMs > 0) {
    return {
      state: previousState,
      classification: {
        label: candidate.label === "none" ? "none" : candidate.label,
        phase: "cooldown",
        confidence: candidate.confidence,
        holdMs: 0,
        cooldownRemainingMs,
        sourceFrameId: candidate.sourceFrameId,
      },
    };
  }

  if (candidate.label === "none") {
    return {
      state: {
        ...previousState,
        activeLabel: "none",
        holdStartedAt: null,
      },
      classification: {
        label: "none",
        phase: "inactive",
        confidence: 0,
        holdMs: 0,
        cooldownRemainingMs: 0,
        sourceFrameId: candidate.sourceFrameId,
      },
    };
  }

  const isSameCandidate = previousState.activeLabel === candidate.label;
  const holdStartedAt = isSameCandidate
    ? previousState.holdStartedAt ?? now
    : now;
  const holdMs = now - holdStartedAt;
  const requiredHoldMs =
    candidate.label === "pinch" ? thresholds.pinchHoldMs : thresholds.openPalmHoldMs;

  if (holdMs >= requiredHoldMs) {
    return {
      state: {
        activeLabel: candidate.label,
        holdStartedAt,
        cooldownUntil: now + thresholds.cooldownMs,
        lastRecognizedAt: now,
      },
      classification: {
        label: candidate.label,
        phase: "recognized",
        confidence: candidate.confidence,
        holdMs,
        cooldownRemainingMs: thresholds.cooldownMs,
        sourceFrameId: candidate.sourceFrameId,
      },
    };
  }

  return {
    state: {
      ...previousState,
      activeLabel: candidate.label,
      holdStartedAt,
    },
    classification: {
      label: candidate.label,
      phase: "holding",
      confidence: candidate.confidence,
      holdMs,
      cooldownRemainingMs: 0,
      sourceFrameId: candidate.sourceFrameId,
    },
  };
}
