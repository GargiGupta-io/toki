import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyPointerExplanationCommand,
  explicitObjectConflictsWithLabel,
  getPointerEvidenceDecision,
  requestCodexPointerExplanation,
  shouldRoutePointerExplanation,
  verifyPointerExplanationResponse,
} from "../apps/desktop/src/gesturePointerExplanation.ts";
import { createPointerLockSnapshot } from "../apps/desktop/src/gestureContracts.ts";

test("recognizes the approved deictic explanation phrases", () => {
  const cases = [
    ["Explain this.", "explain"],
    ["What does this icon do?", "effect"],
    ["What is this feature?", "identity"],
    ["What happens if I use this?", "effect"],
    ["Why is this disabled?", "disabled"],
  ];

  for (const [transcript, questionKind] of cases) {
    const intent = classifyPointerExplanationCommand(transcript);
    assert.equal(intent?.deictic, true, transcript);
    assert.equal(intent?.questionKind, questionKind, transcript);
  }

  assert.equal(classifyPointerExplanationCommand("Play the next song."), null);
});

test("keeps an explicitly named object for pointer conflict checks", () => {
  const intent = classifyPointerExplanationCommand("Explain the settings button.");

  assert.equal(intent?.deictic, false);
  assert.equal(intent?.explicitObject, "settings");
  assert.equal(explicitObjectConflictsWithLabel("settings", "Search"), true);
  assert.equal(explicitObjectConflictsWithLabel("settings", "Settings button"), false);
});

test("routes deictic requests without a lock to clarification but preserves ordinary voice", () => {
  const deictic = classifyPointerExplanationCommand("Explain this.");
  const explicit = classifyPointerExplanationCommand("Explain the settings button.");

  assert.equal(shouldRoutePointerExplanation(deictic, false), true);
  assert.equal(shouldRoutePointerExplanation(explicit, false), false);
  assert.equal(shouldRoutePointerExplanation(explicit, true), true);
  assert.equal(shouldRoutePointerExplanation(null, true), false);
});

test("selects one current candidate and refuses equally near distinct controls", () => {
  const candidates = [
    screenCandidate("search", "Search", 100, 100, 30, 30),
    screenCandidate("settings", "Settings", 180, 100, 30, 30),
  ];

  const unique = getPointerEvidenceDecision(candidates, { x: 112, y: 115 });
  assert.equal(unique.status, "unique");
  assert.equal(unique.candidate?.id, "search");

  const ambiguous = getPointerEvidenceDecision(
    [
      screenCandidate("left", "Left action", 100, 100, 20, 30),
      screenCandidate("right", "Right action", 124, 100, 20, 30),
    ],
    { x: 122, y: 115 },
  );
  assert.equal(ambiguous.status, "ambiguous");
});

test("accepts a short grounded answer that stays on the frozen point", () => {
  const request = providerRequest();
  const result = verifyPointerExplanationResponse(
    JSON.stringify({
      found: true,
      label: "Recently played tab",
      explanation: "Shows songs and other items you played recently.",
      confidence: 0.94,
      evidence: ["The visible tab label reads Recently played."],
      riskWarning: "",
      disabled: false,
      target: { centerX: 420, centerY: 280, width: 150, height: 36 },
    }),
    request,
  );

  assert.equal(result.status, "grounded");
  assert.equal(result.label, "Recently played tab");
  assert.equal(result.confidence, 0.94);
});

test("refuses provider answers that move away, stay generic, or conflict with speech", () => {
  const base = {
    found: true,
    label: "Recently played tab",
    explanation: "Shows recently played media.",
    confidence: 0.94,
    evidence: ["Visible tab text."],
    riskWarning: "",
    disabled: false,
    target: { centerX: 420, centerY: 280, width: 150, height: 36 },
  };

  const moved = verifyPointerExplanationResponse(
    JSON.stringify({
      ...base,
      target: { centerX: 700, centerY: 500, width: 40, height: 40 },
    }),
    providerRequest(),
  );
  assert.equal(moved.status, "clarify");
  assert.equal(moved.reason, "moved_target");

  const generic = verifyPointerExplanationResponse(
    JSON.stringify({ ...base, label: "icon" }),
    providerRequest({ structuredEvidence: null }),
  );
  assert.equal(generic.status, "clarify");
  assert.equal(generic.reason, "generic_label");

  const conflict = verifyPointerExplanationResponse(
    JSON.stringify({ ...base, label: "Search" }),
    providerRequest({
      intent: {
        ...providerRequest().intent,
        explicitObject: "settings",
        deictic: false,
      },
      structuredEvidence: null,
    }),
  );
  assert.equal(conflict.status, "clarify");
  assert.equal(conflict.reason, "spoken_object_conflict");
});

test("sends the frozen point and bounded region through the existing subscription bridge", async () => {
  let nativeArgs;
  const result = await requestCodexPointerExplanation(providerRequest(), {
    invokeImpl: async (command, args) => {
      assert.equal(command, "request_codex_vision_guidance");
      nativeArgs = args;
      return {
        rawAnswer: JSON.stringify({
          found: true,
          label: "Recently played tab",
          explanation: "Shows songs and media played recently.",
          confidence: 0.91,
          evidence: ["Visible label and tab boundary at the locked point."],
          riskWarning: "",
          disabled: false,
          target: { centerX: 420, centerY: 280, width: 150, height: 36 },
        }),
        providerName: "codex-subscription:test",
        durationMs: 14,
      };
    },
  });

  assert.equal(result.status, "grounded");
  assert.match(nativeArgs.request.prompt, /Exact locked point: 420,280/);
  assert.match(nativeArgs.request.prompt, /Bounded focus region: 340,200,160x160/);
  assert.equal(nativeArgs.request.imageBase64, "dGVzdA==");
});

test("the explanation provider has no click or generic guidance side effects", () => {
  const source = readFileSync(
    new URL("../apps/desktop/src/gesturePointerExplanation.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /\.click\(|emitTo\(|refreshCaptureMetadata|setGuidanceResult|acceptedTarget/,
  );
});

test("the overlay revalidates the frozen screen before the provider and never renders it as guidance", () => {
  const appSource = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const cardSource = readFileSync(
    new URL("../apps/desktop/src/TokiPointerExplanationCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    appSource,
    /createScreenStateFingerprint\(snapshot\.window\)[\s\S]*?getPointerLockInvalidationReason[\s\S]*?requestCodexPointerExplanation/,
  );
  assert.match(appSource, /shouldRoutePointerExplanation/);
  assert.match(appSource, /current\?\.id === lock\.id \? null : current/);
  assert.doesNotMatch(cardSource, /BlobPuck|target=|onClick|onPointer/);
});

function providerRequest(overrides = {}) {
  const intent = classifyPointerExplanationCommand("Explain this.");
  assert.ok(intent);

  return {
    transcript: "Explain this.",
    intent,
    lock: pointerLock(),
    appName: "Spotify",
    image: {
      imageBase64: "dGVzdA==",
      format: "jpeg",
      width: 1200,
      height: 800,
    },
    lockedPoint: { x: 420, y: 280 },
    focusRegion: { x: 340, y: 200, width: 160, height: 160 },
    structuredEvidence: {
      candidateId: "recent",
      label: "Recently played",
      role: "ocr_text",
      source: "ocr",
      imageRect: { x: 360, y: 262, width: 140, height: 36 },
    },
    ...overrides,
  };
}

function pointerLock() {
  return createPointerLockSnapshot({
    id: "lock-1",
    lockedAt: "2026-07-16T00:00:00.000Z",
    pointer: {
      phase: "tracking",
      handTrackId: "pointer-hand",
      normalized: { x: 0.3, y: 0.4 },
      display: { displayId: "main", x: 420, y: 280 },
      confidence: 0.96,
      sourceFrameId: 42,
      capturedAt: "2026-07-16T00:00:00.000Z",
    },
    evidence: {
      snapshotId: "screen-1",
      capturedAt: "2026-07-16T00:00:00.000Z",
      activeWindowId: "spotify-window",
    },
    display: { id: "main", width: 1470, height: 956, scaleFactor: 2 },
  });
}

function screenCandidate(id, label, x, y, width, height) {
  return {
    id,
    candidateId: id,
    label,
    x,
    y,
    width,
    height,
    role: "ocr_text",
    source: "ocr",
  };
}
