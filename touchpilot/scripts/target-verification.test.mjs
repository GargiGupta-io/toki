import assert from "node:assert/strict";
import test from "node:test";
import { verifyGuidanceTarget } from "../apps/desktop/src/targetVerification.ts";

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
      reasons: ["intent-action:create", "clickable-role"],
    },
    ...overrides,
  };
}

function request(candidates = []) {
  return {
    goal: "Create a report",
    screen: {
      display: { width: 800, height: 600, scaleFactor: 1 },
      candidates,
    },
  };
}

function response(target, confidence = 0.88) {
  return {
    mode: "ollama-vision",
    providerName: "ollama-vision:test",
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

  assert.equal(result.mode, "ollama-vision");
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
      reasons: ["intent-action:next", "clickable-role"],
    },
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "ollama-vision-target",
      label: "Next icon",
      x: 205,
      y: 205,
      width: 30,
      height: 30,
    }),
    request([accessibility]),
  );

  assert.deepEqual(result.result.step.target, {
    candidateId: "ax-next",
    label: "Next icon",
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
    label: "Download",
    role: "ocr_text",
    source: "ocr",
    x: 300,
    y: 300,
    width: 100,
    height: 20,
  });
  const result = verifyGuidanceTarget(
    response({
      candidateId: "ollama-vision-target",
      label: "Download button",
      x: 330,
      y: 296,
      width: 44,
      height: 44,
    }),
    request([ocr]),
  );

  assert.deepEqual(result.result.step.target, {
    candidateId: "ocr-download",
    label: "Download button",
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

test("vision-only targets retain the provider center", () => {
  const result = verifyGuidanceTarget(
    response({
      candidateId: "ollama-vision-target",
      label: "Unlabelled icon",
      x: 420,
      y: 240,
      width: 44,
      height: 44,
    }),
    request(),
  );

  assert.deepEqual(result.result.step.target, {
    candidateId: undefined,
    label: "Unlabelled icon",
    x: 420,
    y: 240,
    width: 44,
    height: 44,
  });
  assert.equal(result.debug.targetVerification.source, "vision");
  assert.equal(result.debug.targetVerification.match, "vision_only");
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
