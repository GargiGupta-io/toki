import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateFootprint,
  footprintBudgets,
} from "./runtime-footprint.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");

test("production footprint budgets stay bounded", () => {
  assert.equal(footprintBudgets.installedAppBytes, 64 * 1024 * 1024);
  assert.equal(footprintBudgets.productionJavaScriptBytes, 1024 * 1024);

  const withinBudget = Object.fromEntries(
    Object.entries(footprintBudgets).map(([name, budget]) => [name, budget]),
  );
  assert.equal(evaluateFootprint(withinBudget).pass, true);

  assert.equal(
    evaluateFootprint({
      ...withinBudget,
      installedAppBytes: footprintBudgets.installedAppBytes + 1,
    }).pass,
    false,
  );
});

test("ambient liquid motion is capped without capping active target updates", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src/BlobCursor.tsx"),
    "utf8",
  );

  assert.match(source, /blobAmbientFramesPerSecond = 30/);
  assert.match(source, /animationIsAmbientOnlyRef\.current/);
  assert.match(source, /targetRevisionRef\.current/);
  assert.match(source, /!targetChanged/);
  assert.match(source, /remainingDistance > 0\.35/);
});

test("camera inference and private diagnostics retain their bounded rates", () => {
  const runtimeSource = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src/gestureRuntime.ts"),
    "utf8",
  );
  const handLandmarkerSource = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src/handLandmarker.ts"),
    "utf8",
  );
  const diagnosticSource = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src/gestureDiagnostics.ts"),
    "utf8",
  );
  const exportSource = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src/debugExport.ts"),
    "utf8",
  );

  // 30 fps lands on the 60 Hz requestAnimationFrame grid. 24 fps does not, and
  // silently degrades to 20 fps because the gate overshoots to the next tick.
  assert.match(runtimeSource, /gestureInferenceFramesPerSecond = 30/);
  assert.match(
    handLandmarkerSource,
    /visionTasksPromise \?\?= import\("@mediapipe\/tasks-vision"\)/,
  );
  assert.doesNotMatch(
    handLandmarkerSource,
    /^import \{[^}]+FilesetResolver[^}]+\} from "@mediapipe\/tasks-vision";/m,
  );
  assert.match(diagnosticSource, /gestureDiagnosticTraceCapacity = 144/);
  assert.match(diagnosticSource, /gestureDiagnosticPublishIntervalMs = 250/);
  assert.match(exportSource, /DEBUG_EXPORT_INTERVAL_MS = 500/);
});

test("footprint command is read-only and reports no camera or audio payload", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "scripts/runtime-footprint.mjs"),
    "utf8",
  );

  assert.doesNotMatch(source, /writeFile|appendFile|rmSync|unlinkSync/);
  assert.doesNotMatch(source, /camera|microphone|audio|landmark/i);
  assert.match(source, /pgrep/);
  assert.match(source, /launchctl/);
  assert.match(source, /application\\\.app\\\.toki\\\.desktop/);
  assert.match(source, /detailed metrics unavailable/);
  assert.match(source, /processes/);
});
