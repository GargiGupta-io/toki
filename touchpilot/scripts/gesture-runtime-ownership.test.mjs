import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEmptyGestureRuntimeDiagnostics,
  getGestureActionForClassification,
} from "../apps/desktop/src/gestureRuntime.ts";

const defaultGestureThresholds = {
  minDetectionConfidence: 0.6,
  pinchHoldMs: 180,
  openPalmHoldMs: 220,
  cooldownMs: 700,
  maxHands: 1,
};

const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
  "utf8",
);
const debugStart = appSource.indexOf("function DebugWindowApp()");
const debugEnd = appSource.indexOf("function App()", debugStart);
const debugSource = appSource.slice(debugStart, debugEnd);

test("empty gesture diagnostics expose state without raw camera frames", () => {
  const diagnostics = createEmptyGestureRuntimeDiagnostics(
    defaultGestureThresholds,
    "2026-07-15T00:00:00.000Z",
  );

  assert.equal(diagnostics.owner, "overlay");
  assert.equal(diagnostics.previewVisible, false);
  assert.equal(diagnostics.rawCameraFramesShared, false);
  assert.equal(diagnostics.updatedAt, "2026-07-15T00:00:00.000Z");
});

test("the persistent overlay runtime owns capture and hand detection", () => {
  assert.match(runtimeSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(runtimeSource, /document\.createElement\("video"\)/);
  assert.match(runtimeSource, /getHandLandmarker/);
  assert.match(runtimeSource, /window\.requestAnimationFrame/);
  assert.match(appSource, /useAlwaysOnGestureRuntime/);
});

test("Debug consumes diagnostics and never owns camera or model processing", () => {
  assert.ok(debugStart >= 0);
  assert.ok(debugEnd > debugStart);
  assert.match(debugSource, /snapshot\.gestureDiagnostics/);
  assert.doesNotMatch(debugSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(debugSource, /getHandLandmarker/);
  assert.doesNotMatch(debugSource, /requestAnimationFrame/);
  assert.doesNotMatch(debugSource, /<video/);
  assert.doesNotMatch(debugSource, /MediaStream/);
});

test("recognized pinch preserves assistant activation", () => {
  const action = getGestureActionForClassification(
    {
      label: "pinch",
      phase: "recognized",
      confidence: 0.93,
      holdMs: 500,
      cooldownRemainingMs: 0,
      sourceFrameId: 42,
    },
    "2026-07-15T00:00:01.000Z",
  );

  assert.deepEqual(action, {
    type: "activate_assistant",
    gesture: "pinch",
    confidence: 0.93,
    firedAt: "2026-07-15T00:00:01.000Z",
    sourceFrameId: 42,
  });
});

test("recognized open palm preserves assistant pause", () => {
  const action = getGestureActionForClassification(
    {
      label: "open_palm",
      phase: "recognized",
      confidence: 0.88,
      holdMs: 800,
      cooldownRemainingMs: 0,
      sourceFrameId: 84,
    },
    "2026-07-15T00:00:02.000Z",
  );

  assert.deepEqual(action, {
    type: "pause_assistant",
    gesture: "open_palm",
    confidence: 0.88,
    firedAt: "2026-07-15T00:00:02.000Z",
    sourceFrameId: 84,
  });
});

test("unrecognized or inactive classifications do not fire actions", () => {
  assert.equal(
    getGestureActionForClassification(
      {
        label: "pinch",
        phase: "holding",
        confidence: 0.9,
        holdMs: 200,
        cooldownRemainingMs: 0,
      },
      "2026-07-15T00:00:03.000Z",
    ),
    null,
  );
});
