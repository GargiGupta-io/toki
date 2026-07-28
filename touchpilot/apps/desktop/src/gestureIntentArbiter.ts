export type GestureIntent =
  | "point"
  | "wrist_roll"
  | "ordinary_pinch"
  | "control_pinch"
  | "open_palm"
  | "camera_shutdown";

export type GestureIntentLifecycle = "candidate" | "active" | "leased";

export type GestureIntentCandidate = {
  intent: GestureIntent;
  trackId: string;
  confidence: number;
  lifecycle?: GestureIntentLifecycle;
  sourceFrameId?: number;
};

export type GestureIntentOwner = {
  intent: GestureIntent;
  trackId: string;
  confidence: number;
  lifecycle: GestureIntentLifecycle;
  acquiredAtMs: number;
  lastSeenAtMs: number;
  leaseUntilMs: number;
  sourceFrameId?: number;
};

export type GestureIntentSuppressionReason =
  | "active_owner_retained"
  | "owner_lease_retained"
  | "higher_priority_intent"
  | "duplicate_candidate";

export type GestureIntentSuppression = {
  intent: GestureIntent;
  trackId: string;
  reason: GestureIntentSuppressionReason;
  winner: GestureIntent;
  sourceFrameId?: number;
};

export type GestureIntentArbiterState = {
  owners: Record<string, GestureIntentOwner>;
};

export type GestureIntentArbiterSnapshot = {
  owners: GestureIntentOwner[];
  selected: GestureIntentCandidate[];
  suppressed: GestureIntentSuppression[];
  updatedAtMs: number;
};

export const gestureIntentArbiterPolicy = Object.freeze({
  ownerLeaseMs: 250,
});

const intentPriority: Record<GestureIntent, number> = {
  camera_shutdown: 700,
  wrist_roll: 600,
  control_pinch: 520,
  ordinary_pinch: 500,
  point: 400,
  open_palm: 100,
};

export function createInitialGestureIntentArbiterState(): GestureIntentArbiterState {
  return { owners: {} };
}

export function createEmptyGestureIntentArbiterSnapshot(
  updatedAtMs = 0,
): GestureIntentArbiterSnapshot {
  return {
    owners: [],
    selected: [],
    suppressed: [],
    updatedAtMs,
  };
}

export function advanceGestureIntentArbiter({
  previousState,
  candidates,
  nowMs,
}: {
  previousState: GestureIntentArbiterState;
  candidates: GestureIntentCandidate[];
  nowMs: number;
}): {
  state: GestureIntentArbiterState;
  snapshot: GestureIntentArbiterSnapshot;
} {
  const candidatesByTrack = groupCandidatesByTrack(candidates);
  const trackIds = new Set([
    ...Object.keys(previousState.owners),
    ...candidatesByTrack.keys(),
  ]);
  const owners: Record<string, GestureIntentOwner> = {};
  const selected: GestureIntentCandidate[] = [];
  const suppressed: GestureIntentSuppression[] = [];

  for (const trackId of [...trackIds].sort()) {
    const previousOwner = previousState.owners[trackId] ?? null;
    const trackCandidates = dedupeCandidates(
      candidatesByTrack.get(trackId) ?? [],
      suppressed,
    );
    const explicitWinner = rankCandidates(trackCandidates)[0] ?? null;
    const leasedOwner =
      previousOwner != null && nowMs <= previousOwner.leaseUntilMs
        ? ownerAsLeasedCandidate(previousOwner)
        : null;
    const winner = chooseWinner(previousOwner, explicitWinner, leasedOwner);

    if (winner == null) {
      continue;
    }

    const explicitMatch = trackCandidates.find(
      (candidate) => candidate.intent === winner.intent,
    );
    const selectedCandidate = explicitMatch ?? winner;
    const owner = createOwner({
      previousOwner,
      selected: selectedCandidate,
      nowMs,
    });
    owners[trackId] = owner;
    selected.push(copyCandidate(selectedCandidate));

    for (const candidate of trackCandidates) {
      if (candidate.intent === selectedCandidate.intent) {
        continue;
      }

      suppressed.push({
        intent: candidate.intent,
        trackId,
        reason: suppressionReason(selectedCandidate, explicitMatch == null),
        winner: selectedCandidate.intent,
        sourceFrameId: candidate.sourceFrameId,
      });
    }
  }

  const snapshot: GestureIntentArbiterSnapshot = {
    owners: Object.values(owners)
      .sort((left, right) => left.trackId.localeCompare(right.trackId))
      .map(copyOwner),
    selected: selected
      .sort(compareCandidateIdentity)
      .map(copyCandidate),
    suppressed: suppressed
      .sort(compareSuppressionIdentity)
      .map((item) => ({ ...item })),
    updatedAtMs: nowMs,
  };

  return {
    state: { owners },
    snapshot,
  };
}

export function isGestureIntentSelected(
  snapshot: GestureIntentArbiterSnapshot,
  intent: GestureIntent,
  trackId: string | null | undefined,
): boolean {
  return (
    trackId != null &&
    snapshot.selected.some(
      (candidate) => candidate.trackId === trackId && candidate.intent === intent,
    )
  );
}

function groupCandidatesByTrack(
  candidates: GestureIntentCandidate[],
): Map<string, GestureIntentCandidate[]> {
  const grouped = new Map<string, GestureIntentCandidate[]>();

  for (const candidate of candidates) {
    if (candidate.trackId.length === 0) {
      continue;
    }

    const trackCandidates = grouped.get(candidate.trackId) ?? [];
    trackCandidates.push({
      ...candidate,
      confidence: clamp01(candidate.confidence),
      lifecycle: candidate.lifecycle ?? "candidate",
    });
    grouped.set(candidate.trackId, trackCandidates);
  }

  return grouped;
}

function dedupeCandidates(
  candidates: GestureIntentCandidate[],
  suppressed: GestureIntentSuppression[],
): GestureIntentCandidate[] {
  const byIntent = new Map<GestureIntent, GestureIntentCandidate>();

  for (const candidate of candidates) {
    const current = byIntent.get(candidate.intent);
    if (current == null || compareCandidateRank(candidate, current) < 0) {
      if (current != null) {
        suppressed.push({
          intent: current.intent,
          trackId: current.trackId,
          reason: "duplicate_candidate",
          winner: candidate.intent,
          sourceFrameId: current.sourceFrameId,
        });
      }
      byIntent.set(candidate.intent, candidate);
    } else {
      suppressed.push({
        intent: candidate.intent,
        trackId: candidate.trackId,
        reason: "duplicate_candidate",
        winner: current.intent,
        sourceFrameId: candidate.sourceFrameId,
      });
    }
  }

  return [...byIntent.values()];
}

function rankCandidates(
  candidates: GestureIntentCandidate[],
): GestureIntentCandidate[] {
  return [...candidates].sort(compareCandidateRank);
}

function compareCandidateRank(
  left: GestureIntentCandidate,
  right: GestureIntentCandidate,
): number {
  const priorityDifference =
    getCandidatePriority(right) - getCandidatePriority(left);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const confidenceDifference = right.confidence - left.confidence;
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  return left.intent.localeCompare(right.intent);
}

function getCandidatePriority(candidate: GestureIntentCandidate): number {
  return (
    intentPriority[candidate.intent] +
    (candidate.lifecycle === "active" && isProtectedActiveIntent(candidate.intent)
      ? 1_000
      : 0)
  );
}

function isProtectedActiveIntent(intent: GestureIntent): boolean {
  return (
    intent === "ordinary_pinch" ||
    intent === "control_pinch" ||
    intent === "wrist_roll" ||
    intent === "camera_shutdown"
  );
}

function chooseWinner(
  previousOwner: GestureIntentOwner | null,
  explicitWinner: GestureIntentCandidate | null,
  leasedOwner: GestureIntentCandidate | null,
): GestureIntentCandidate | null {
  if (explicitWinner == null) {
    return leasedOwner;
  }
  if (leasedOwner == null) {
    return explicitWinner;
  }

  const explicitPriority = getCandidatePriority(explicitWinner);
  const leasedPriority = getCandidatePriority(leasedOwner);
  if (explicitPriority > leasedPriority) {
    return explicitWinner;
  }
  if (leasedPriority > explicitPriority) {
    return leasedOwner;
  }

  return previousOwner?.intent === explicitWinner.intent
    ? explicitWinner
    : leasedOwner;
}

function createOwner({
  previousOwner,
  selected,
  nowMs,
}: {
  previousOwner: GestureIntentOwner | null;
  selected: GestureIntentCandidate;
  nowMs: number;
}): GestureIntentOwner {
  const sameOwner =
    previousOwner?.trackId === selected.trackId &&
    previousOwner.intent === selected.intent;
  const isLeased = selected.lifecycle === "leased";

  return {
    intent: selected.intent,
    trackId: selected.trackId,
    confidence: selected.confidence,
    lifecycle: selected.lifecycle ?? "candidate",
    acquiredAtMs: sameOwner ? previousOwner.acquiredAtMs : nowMs,
    lastSeenAtMs:
      isLeased && sameOwner ? previousOwner.lastSeenAtMs : nowMs,
    leaseUntilMs:
      isLeased && sameOwner
        ? previousOwner.leaseUntilMs
        : nowMs + gestureIntentArbiterPolicy.ownerLeaseMs,
    sourceFrameId: selected.sourceFrameId,
  };
}

function ownerAsLeasedCandidate(
  owner: GestureIntentOwner,
): GestureIntentCandidate & { lifecycle: "leased" } {
  return {
    intent: owner.intent,
    trackId: owner.trackId,
    confidence: owner.confidence,
    lifecycle: "leased",
    sourceFrameId: owner.sourceFrameId,
  };
}

function suppressionReason(
  winner: GestureIntentCandidate,
  winnerWasLeased: boolean,
): GestureIntentSuppressionReason {
  if (winnerWasLeased) {
    return "owner_lease_retained";
  }
  if (
    winner.lifecycle === "active" &&
    isProtectedActiveIntent(winner.intent)
  ) {
    return "active_owner_retained";
  }
  return "higher_priority_intent";
}

function compareCandidateIdentity(
  left: GestureIntentCandidate,
  right: GestureIntentCandidate,
): number {
  return (
    left.trackId.localeCompare(right.trackId) ||
    left.intent.localeCompare(right.intent)
  );
}

function compareSuppressionIdentity(
  left: GestureIntentSuppression,
  right: GestureIntentSuppression,
): number {
  return (
    left.trackId.localeCompare(right.trackId) ||
    left.intent.localeCompare(right.intent) ||
    left.reason.localeCompare(right.reason)
  );
}

function copyCandidate(
  candidate: GestureIntentCandidate,
): GestureIntentCandidate {
  return { ...candidate };
}

function copyOwner(owner: GestureIntentOwner): GestureIntentOwner {
  return { ...owner };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
