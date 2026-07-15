import type {
  GestureInteractionState,
  GesturePointerSample,
  GestureTimingPolicy,
  PointerEvidenceFingerprint,
  PointerLockSnapshot,
} from "@toki/shared";

export const gestureContractVersion = 1 as const;

export const defaultGestureTimingPolicy: Readonly<GestureTimingPolicy> = Object.freeze({
  humanGraceMs: 2_000,
  doubleTapMaxGapMs: 2_000,
  trackingLossGraceMs: 2_000,
  lockFreshnessMaxAgeMs: 5_000,
});

export function createIdleGestureInteractionState({
  now,
  activeProfileId = null,
}: {
  now: string;
  activeProfileId?: string | null;
}): GestureInteractionState {
  return {
    version: gestureContractVersion,
    mode: "idle",
    handRoles: {},
    pointer: null,
    tap: { phase: "idle" },
    lock: null,
    activeProfileId,
    lastTransitionAt: now,
  };
}

export function createPointerLockSnapshot({
  id,
  lockedAt,
  pointer,
  evidence,
  display,
}: {
  id: string;
  lockedAt: string;
  pointer: GesturePointerSample;
  evidence: PointerEvidenceFingerprint;
  display: PointerLockSnapshot["display"];
}): PointerLockSnapshot {
  const normalized = Object.freeze({ ...pointer.normalized });
  const displayPoint = Object.freeze({ ...pointer.display });
  const frozenPointer = Object.freeze({
    ...pointer,
    normalized,
    display: displayPoint,
  });
  const frozenEvidence = Object.freeze({ ...evidence });
  const frozenDisplay = Object.freeze({ ...display });

  return Object.freeze({
    id,
    status: "locked" as const,
    lockedAt,
    pointer: frozenPointer,
    evidence: frozenEvidence,
    display: frozenDisplay,
  });
}
