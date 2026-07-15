import assert from "node:assert/strict";
import test from "node:test";
import {
  getAcceptedGuidanceResult,
  getRenderableGuidanceResult,
} from "../apps/desktop/src/guidanceAcceptance.ts";
import {
  isGenericTargetLabel,
  verifyGuidanceTarget,
} from "../apps/desktop/src/targetVerification.ts";

function candidate(overrides = {}) {
  return {
    id: "candidate-1",
    candidateId: "candidate-1",
    label: "Create button",
    role: "dom_button",
    source: "dom",
    x: 100,
    y: 100,
    width: 120,
    height: 40,
    rank: {
      position: 1,
      score: 52,
      reasons: [
        "intent-action:create",
        "intent-object:file",
        "intent-action-object-pair",
        "clickable-role",
      ],
    },
    metadata: { nativeHelp: "Create a report" },
    ...overrides,
  };
}

function request(candidates = [], goal = "Create a report") {
  return {
    goal,
    screen: {
      display: { width: 800, height: 600, scaleFactor: 1 },
      candidates,
    },
  };
}

function response(target, confidence = 0.88) {
  return {
    mode: "codex-subscription",
    providerName: "codex-subscription:test",
    result: {
      mode: "guide",
      summary: "Target selected",
      step: {
        instruction: `Click ${target.label}.`,
        target,
        confidence,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
    validation: { valid: true, issues: [] },
  };
}

function visionResponse(
  target,
  confidence = 0.88,
  reason = `The ${target.label} is visibly present in the current screenshot.`,
) {
  return {
    ...response(target, confidence),
    debug: {
      providerOutput: {
        rawAnswer: JSON.stringify({ target, confidence, reason }),
        label: target.label,
        reason,
        confidence,
        target,
      },
      vision: {
        coordinateMode: "center",
        rawTarget: target,
        mappedBeforeTighten: target,
      },
    },
  };
}

function candidateBackedVisionResponse(
  target,
  providerLabel,
  confidence,
  reason,
) {
  const providerTarget = {
    ...target,
    label: providerLabel,
  };
  const providerResponse = visionResponse(
    providerTarget,
    confidence,
    reason,
  );

  return {
    ...providerResponse,
    result: {
      ...providerResponse.result,
      step: {
        ...providerResponse.result.step,
        target,
      },
    },
    debug: {
      ...providerResponse.debug,
      vision: {
        ...providerResponse.debug.vision,
        coordinateMode: "candidate",
        mappedBeforeTighten: target,
      },
    },
  };
}

test("exact DOM candidate uses its verified center", () => {
  const result = verifyGuidanceTarget(
    response({
      candidateId: "candidate-1",
      label: "Create button",
      x: 104,
      y: 102,
      width: 110,
      height: 36,
    }),
    request([candidate()]),
  );

  assert.equal(result.mode, "codex-subscription");
  assert.deepEqual(result.result.step.target, {
    candidateId: "candidate-1",
    label: "Create button",
    x: 140,
    y: 100,
    width: 40,
    height: 40,
  });
  assert.equal(result.debug.targetVerification.source, "dom");
  assert.equal(result.debug.targetVerification.match, "candidate_id");
  assert.deepEqual(result.debug.targetVerification.clickPoint, { x: 160, y: 120 });
  assert.equal(result.debug.providerOutput.label, "Create button");
  assert.equal(result.debug.providerOutput.reason, "Target selected");
  assert.equal(result.debug.providerOutput.confidence, 0.88);
  assert.deepEqual(result.debug.targetVerification.inputTarget, {
    candidateId: "candidate-1",
    label: "Create button",
    x: 104,
    y: 102,
    width: 110,
    height: 36,
  });
  assert.equal(result.debug.targetVerification.commandIntent.action, "create");
  assert.equal(result.debug.targetVerification.commandIntent.object, "file");
  assert.equal(
    result.debug.targetVerification.supportingEvidence.candidateId,
    "candidate-1",
  );
});

test("nearby vision target snaps to structured Accessibility evidence", () => {
  const accessibility = candidate({
    id: "ax-next",
    candidateId: "ax-next",
    label: "Next button",
    role: "accessibility_element",
    source: "accessibility",
    x: 200,
    y: 200,
    width: 40,
    height: 40,
    rank: {
      position: 1,
      score: 48,
      reasons: [
        "intent-action:next",
        "intent-object:media",
        "intent-action-object-pair",
        "clickable-role",
      ],
    },
    metadata: { nativeHelp: "Skip to the next song" },
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "vision-model-target",
      label: "Next icon",
      x: 205,
      y: 205,
      width: 30,
      height: 30,
    }),
    request([accessibility], "Play the next song"),
  );

  assert.deepEqual(result.result.step.target, {
    candidateId: "ax-next",
    label: "Next button",
    x: 200,
    y: 200,
    width: 40,
    height: 40,
  });
  assert.equal(result.debug.targetVerification.source, "accessibility");
  assert.equal(result.debug.targetVerification.match, "spatial_candidate");
});

test("OCR supports a vision target without replacing its click point", () => {
  const ocr = candidate({
    id: "ocr-download",
    candidateId: "ocr-download",
    label: "Download report",
    role: "ocr_text",
    source: "ocr",
    x: 300,
    y: 300,
    width: 100,
    height: 20,
    metadata: {},
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "vision-model-target",
      label: "Download button",
      x: 330,
      y: 296,
      width: 44,
      height: 44,
    }),
    request([ocr], "Download the report"),
  );

  assert.deepEqual(result.result.step.target, {
    candidateId: "ocr-download",
    label: "Download report",
    x: 330,
    y: 296,
    width: 44,
    height: 44,
  });
  assert.equal(result.debug.targetVerification.source, "ocr");
  assert.ok(
    result.debug.targetVerification.reasons.includes(
      "provider-center-click-point",
    ),
  );
});

test("exact symbolic OCR geometry combines with specific current-image semantics", () => {
  const createPlaylist = candidate({
    id: "ocr-candidate-13",
    candidateId: "ocr-candidate-13",
    label: "+",
    role: "ocr_text",
    source: "ocr",
    x: 267,
    y: 220,
    width: 19,
    height: 19,
    metadata: {},
    rank: {
      position: 4,
      score: 29.4,
      reasons: [
        "intent-action:create",
        "intent-primary-action:create",
        "ocr-visible",
      ],
    },
  });
  const target = {
    candidateId: createPlaylist.id,
    label: createPlaylist.label,
    x: createPlaylist.x,
    y: createPlaylist.y,
    width: createPlaylist.width,
    height: createPlaylist.height,
  };
  const result = verifyGuidanceTarget(
    candidateBackedVisionResponse(
      target,
      "Create playlist (+) button",
      0.98,
      "The visible plus icon in Spotify's left sidebar is the control used to create or add a new playlist.",
    ),
    request([createPlaylist], "How to make a playlist on Spotify?"),
  );

  assert.equal(result.mode, "codex-subscription");
  assert.equal(result.debug.targetVerification.status, "accepted");
  assert.equal(result.debug.targetVerification.source, "ocr");
  assert.equal(result.debug.targetVerification.match, "candidate_id");
  assert.equal(result.debug.targetVerification.supportingEvidence.label, "+");
  assert.equal(
    result.debug.targetVerification.supportingEvidence.resolvedLabel,
    "Create playlist (+) button",
  );
  assert.ok(
    result.debug.targetVerification.reasons.includes(
      "provider-semantic-augmentation",
    ),
  );
});

test("combined evidence cannot override conflicting structured semantics", () => {
  const pause = candidate({
    id: "ocr-pause",
    candidateId: "ocr-pause",
    label: "icon",
    role: "ocr_text",
    source: "ocr",
    metadata: { nativeHelp: "Pause playback" },
  });
  const target = {
    candidateId: pause.id,
    label: pause.label,
    x: pause.x,
    y: pause.y,
    width: pause.width,
    height: pause.height,
  };
  const result = verifyGuidanceTarget(
    candidateBackedVisionResponse(
      target,
      "Next track button",
      0.98,
      "The visible control skips to the next song.",
    ),
    request([pause], "Play the next song"),
  );

  assert.equal(result.mode, "unavailable");
  assert.match(result.error, /does not match the requested action next/);
  assert.ok(
    !result.debug.targetVerification.reasons.includes(
      "provider-semantic-augmentation",
    ),
  );
});

test("combined evidence enforces the provider-confidence boundary", () => {
  const plus = candidate({
    id: "ocr-plus",
    candidateId: "ocr-plus",
    label: "+",
    role: "ocr_text",
    source: "ocr",
    metadata: {},
  });
  const target = {
    candidateId: plus.id,
    label: plus.label,
    x: plus.x,
    y: plus.y,
    width: plus.width,
    height: plus.height,
  };
  const lowResult = verifyGuidanceTarget(
    candidateBackedVisionResponse(
      target,
      "Create playlist (+) button",
      0.719,
      "The visible plus icon creates a new playlist.",
    ),
    request([plus], "How to make a playlist on Spotify?"),
  );
  const boundaryResult = verifyGuidanceTarget(
    candidateBackedVisionResponse(
      target,
      "Create playlist (+) button",
      0.72,
      "The visible plus icon creates a new playlist.",
    ),
    request([plus], "How to make a playlist on Spotify?"),
  );

  assert.equal(lowResult.mode, "unavailable");
  assert.match(
    lowResult.error,
    /does not match the requested object collection/,
  );
  assert.ok(
    !lowResult.debug.targetVerification.reasons.includes(
      "provider-semantic-augmentation",
    ),
  );
  assert.equal(boundaryResult.mode, "codex-subscription");
  assert.ok(
    boundaryResult.debug.targetVerification.reasons.includes(
      "provider-semantic-augmentation",
    ),
  );
});

test("combined evidence requires a current-image localization trace", () => {
  const plus = candidate({
    id: "ocr-plus-no-trace",
    candidateId: "ocr-plus-no-trace",
    label: "+",
    role: "ocr_text",
    source: "ocr",
    metadata: {},
  });
  const result = verifyGuidanceTarget(
    response(
      {
        candidateId: plus.id,
        label: plus.label,
        x: plus.x,
        y: plus.y,
        width: plus.width,
        height: plus.height,
      },
      0.98,
    ),
    request([plus], "How to make a playlist on Spotify?"),
  );

  assert.equal(result.mode, "unavailable");
  assert.match(result.error, /does not match the requested object collection/);
  assert.ok(
    !result.debug.targetVerification.reasons.includes(
      "provider-semantic-augmentation",
    ),
  );
});

test("specific high-confidence current-image target is accepted without structured candidates", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "vision-model-target",
        label: "Next track button",
        x: 420,
        y: 240,
        width: 44,
        height: 44,
      },
      0.91,
      "The visible next track button skips to the next song.",
    ),
    request([], "Play the next song"),
  );

  assert.equal(result.mode, "codex-subscription");
  assert.equal(result.debug.targetVerification.status, "accepted");
  assert.equal(result.debug.targetVerification.source, "vision");
  assert.equal(result.debug.targetVerification.match, "vision_only");
  assert.equal(result.debug.targetVerification.supportingEvidence.source, "vision");
  assert.equal(result.result.step.target.label, "Next track button");
  assert.deepEqual(result.debug.targetVerification.clickPoint, { x: 442, y: 262 });
  assert.ok(result.debug.targetVerification.groundingScore >= 70);
});

test("read-only media-history guidance accepts the visible recently played tab", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "",
        label: "Recently played tab",
        x: 500,
        y: 100,
        width: 108,
        height: 26,
      },
      0.99,
      "The right-side queue panel visibly shows a Recently played tab beside the selected Queue tab.",
    ),
    request([], "How to see the recently played songs."),
  );

  assert.equal(result.mode, "codex-subscription");
  assert.equal(result.debug.targetVerification.status, "accepted");
  assert.equal(result.debug.targetVerification.commandIntent.action, "open");
  assert.equal(result.debug.targetVerification.commandIntent.object, "media");
  assert.ok(
    result.debug.targetVerification.supportingEvidence.matchedActions.includes(
      "open",
    ),
  );
  assert.ok(
    result.debug.targetVerification.supportingEvidence.matchedObjects.includes(
      "media",
    ),
  );
});

test("read-only media-history guidance rejects an unrelated recent tab", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "",
        label: "Recent profiles tab",
        x: 500,
        y: 100,
        width: 108,
        height: 26,
      },
      0.99,
      "The visible tab contains recently viewed user profiles.",
    ),
    request([], "How to see the recently played songs."),
  );

  assert.equal(result.mode, "unavailable");
  assert.match(result.error, /does not match the requested object media/);
});

test("low-confidence current-image target is rejected", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "vision-model-target",
        label: "Next track button",
        x: 420,
        y: 240,
        width: 44,
        height: 44,
      },
      0.65,
      "The next track button may be visible, but its location is uncertain.",
    ),
    request([], "Play the next song"),
  );

  assert.equal(result.mode, "unavailable");
  assert.equal(result.result, undefined);
  assert.match(result.error, /confidence 65% is below the required 72%/);
  assert.equal(result.debug.targetVerification.status, "rejected");
  assert.equal(result.debug.targetVerification.source, "vision");
});

test("generic current-image labels are rejected even at high confidence", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "vision-model-target",
        label: "Unlabelled icon",
        x: 420,
        y: 240,
        width: 44,
        height: 44,
      },
      0.95,
      "The icon may be the next-song control.",
    ),
    request([], "Play the next song"),
  );

  assert.equal(result.mode, "unavailable");
  assert.equal(result.result, undefined);
  assert.match(result.error, /blank or generic label/);
  assert.equal(result.debug.targetVerification.status, "rejected");
  assert.equal(result.debug.targetVerification.source, "vision");
  assert.equal(result.debug.targetVerification.match, "vision_only");
});

test("semantically mismatched current-image targets are rejected", () => {
  const result = verifyGuidanceTarget(
    visionResponse(
      {
        candidateId: "vision-model-target",
        label: "Pause playback button",
        x: 420,
        y: 240,
        width: 44,
        height: 44,
      },
      0.94,
      "The visible pause playback button pauses the current song.",
    ),
    request([], "Play the next song"),
  );

  assert.equal(result.mode, "unavailable");
  assert.equal(result.result, undefined);
  assert.match(result.error, /does not match the requested action next/);
  assert.equal(result.debug.targetVerification.status, "rejected");
  assert.equal(result.debug.targetVerification.source, "vision");
  assert.equal(result.debug.targetVerification.match, "vision_only");
});

test("nearby but semantically unrelated evidence is rejected with its mismatch", () => {
  const plus = candidate({
    id: "create-playlist",
    label: "Plus icon",
    x: 420,
    y: 240,
    width: 44,
    height: 44,
    metadata: { nativeHelp: "Create a new playlist" },
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "vision-model-target",
      label: "plus icon",
      x: 420,
      y: 240,
      width: 44,
      height: 44,
    }),
    request([plus], "Play the next song"),
  );

  assert.equal(result.mode, "unavailable");
  assert.equal(result.result, undefined);
  assert.match(result.error, /does not match the requested action next/);
  assert.equal(
    result.debug.targetVerification.supportingEvidence.candidateId,
    "create-playlist",
  );
  assert.equal(result.debug.targetVerification.groundingVerdict, "rejected");
});

test("stale candidate ids are rejected", () => {
  const result = verifyGuidanceTarget(
    response({
      candidateId: "missing-candidate",
      label: "Create button",
      x: 100,
      y: 100,
      width: 44,
      height: 44,
    }),
    request([candidate()]),
  );

  assert.equal(result.mode, "unavailable");
  assert.equal(result.result, undefined);
  assert.match(result.error, /missing-candidate is not present/);
  assert.equal(result.debug.targetVerification.status, "rejected");
});

test("hidden and intent-conflicting exact candidates are rejected", () => {
  const hiddenResult = verifyGuidanceTarget(
    response({
      candidateId: "candidate-1",
      label: "Create button",
      x: 100,
      y: 100,
      width: 44,
      height: 44,
    }),
    request([candidate({ metadata: { hidden: true } })]),
  );
  const conflictResult = verifyGuidanceTarget(
    response({
      candidateId: "candidate-1",
      label: "Create button",
      x: 100,
      y: 100,
      width: 44,
      height: 44,
    }),
    request([
      candidate({
        rank: {
          position: 1,
          score: 35,
          reasons: ["intent-action-conflict:create->next"],
        },
      }),
    ]),
  );

  assert.match(hiddenResult.error, /hidden or disabled/);
  assert.match(conflictResult.error, /conflicts with the current objective/);
});

test("off-display and broad container targets are rejected", () => {
  const offDisplay = verifyGuidanceTarget(
    response({
      label: "Outside",
      x: 790,
      y: 100,
      width: 44,
      height: 44,
    }),
    request(),
  );
  const broad = candidate({
    width: 620,
    height: 240,
    metadata: { nativeRole: "AXWindow" },
  });
  const broadResult = verifyGuidanceTarget(
    response({
      candidateId: "candidate-1",
      label: "Window",
      x: 100,
      y: 100,
      width: 44,
      height: 44,
    }),
    request([broad]),
  );

  assert.match(offDisplay.error, /outside the active display/);
  assert.match(broadResult.error, /broad container/);
});

test("blank and generic candidate labels are rejected", () => {
  for (const label of ["", "Vision target", "button", "icon", "visual description"]) {
    assert.equal(isGenericTargetLabel(label), true, label);
    const genericCandidate = candidate({
      id: `generic-${label || "blank"}`,
      label,
      metadata: {},
      rank: {
        position: 1,
        score: 40,
        reasons: ["clickable-role"],
      },
    });
    const result = verifyGuidanceTarget(
      response({
        candidateId: genericCandidate.id,
        label,
        x: 100,
        y: 100,
        width: 44,
        height: 44,
      }),
      request([genericCandidate]),
    );

    assert.equal(result.mode, "unavailable", label);
    assert.equal(result.result, undefined, label);
    assert.equal(result.debug.targetVerification.status, "rejected", label);
  }
});

test("generic provider wording can pass only through specific current evidence", () => {
  const groundedCandidate = candidate({
    id: "create-playlist",
    label: "Plus icon",
    metadata: { nativeHelp: "Create a new playlist" },
    rank: {
      position: 1,
      score: 92,
      reasons: [
        "intent-action:create",
        "intent-object:collection",
        "intent-action-object-pair",
      ],
    },
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "create-playlist",
      label: "plus icon",
      x: 100,
      y: 100,
      width: 44,
      height: 44,
    }),
    request([groundedCandidate], "Create a new playlist"),
  );

  assert.equal(result.mode, "codex-subscription");
  assert.equal(result.result.step.target.label, "Create a new playlist");
  assert.equal(result.debug.providerOutput.label, "plus icon");
  assert.equal(result.debug.targetVerification.groundingVerdict, "grounded");
  assert.ok(result.debug.targetVerification.groundingScore >= 70);
});

test("different commands on one screen resolve to different grounded regions", () => {
  const create = candidate({
    id: "create-playlist",
    label: "Create playlist",
    x: 100,
    y: 120,
    metadata: { nativeHelp: "Create a new playlist" },
  });
  const next = candidate({
    id: "next-song",
    label: "Next button",
    x: 620,
    y: 520,
    metadata: { nativeHelp: "Skip to the next song" },
    rank: {
      position: 1,
      score: 70,
      reasons: [
        "intent-action:next",
        "intent-object:media",
        "intent-action-object-pair",
      ],
    },
  });
  const candidates = [create, next];
  const createResult = verifyGuidanceTarget(
    response({
      candidateId: create.id,
      label: create.label,
      x: create.x,
      y: create.y,
      width: create.width,
      height: create.height,
    }),
    request(candidates, "Create a new playlist"),
  );
  const nextResult = verifyGuidanceTarget(
    response({
      candidateId: next.id,
      label: next.label,
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
    }),
    request(candidates, "Play the next song"),
  );

  assert.equal(createResult.debug.targetVerification.status, "accepted");
  assert.equal(nextResult.debug.targetVerification.status, "accepted");
  assert.notEqual(
    createResult.result.step.target.candidateId,
    nextResult.result.step.target.candidateId,
  );
  assert.notDeepEqual(
    createResult.debug.targetVerification.clickPoint,
    nextResult.debug.targetVerification.clickPoint,
  );
});

test("rejected targets cannot become renderable overlay guidance", () => {
  const rejected = verifyGuidanceTarget(
    response({
      candidateId: "vision-model-target",
      label: "icon",
      x: 420,
      y: 240,
      width: 44,
      height: 44,
    }),
    request(),
  );
  const forged = {
    ...rejected,
    mode: "codex-subscription",
    result: response({
      label: "icon",
      x: 420,
      y: 240,
      width: 44,
      height: 44,
    }).result,
    validation: { valid: true, issues: [] },
  };
  const safetyAllows = {
    action: "allow",
    reason: "safe_navigation",
    risk: "safe_navigation",
    requiresConfirmation: false,
    message: "Allowed for test",
  };

  assert.equal(getRenderableGuidanceResult(rejected, safetyAllows), null);
  assert.equal(getRenderableGuidanceResult(forged, safetyAllows), null);
});

test("strong-risk targets stay hidden until Show target is acknowledged", () => {
  const accepted = verifyGuidanceTarget(
    response({
      candidateId: "candidate-1",
      label: "Create button",
      x: 100,
      y: 100,
      width: 120,
      height: 40,
    }),
    request([candidate()]),
  );
  const revealRequired = {
    action: "confirm",
    reason: "risky_action",
    risk: "payment",
    requiresConfirmation: true,
    message: "Choose Show target. Toki will not click it.",
  };

  assert.equal(getAcceptedGuidanceResult(accepted, revealRequired), accepted.result);
  assert.equal(getRenderableGuidanceResult(accepted, revealRequired), null);
  assert.equal(
    getRenderableGuidanceResult(accepted, revealRequired, true),
    accepted.result,
  );
});

test("grounded final rectangles remain inside display bounds", () => {
  const edgeCandidate = candidate({
    id: "edge-create",
    label: "Create report",
    x: 776,
    y: 576,
    width: 24,
    height: 24,
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: edgeCandidate.id,
      label: edgeCandidate.label,
      x: edgeCandidate.x,
      y: edgeCandidate.y,
      width: edgeCandidate.width,
      height: edgeCandidate.height,
    }),
    request([edgeCandidate]),
  );
  const target = result.result.step.target;

  assert.ok(target.x >= 0);
  assert.ok(target.y >= 0);
  assert.ok(target.x + target.width <= 800);
  assert.ok(target.y + target.height <= 600);
});
