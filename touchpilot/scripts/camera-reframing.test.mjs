import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cameraReframingLabel,
  cameraReframingMessage,
  initialCameraReframingState,
  shouldWarnAboutCameraReframing,
} from "../apps/desktop/src/cameraReframing.ts";

const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
  "utf8",
);
const nativeSource = readFileSync(
  new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);

function state(active) {
  return { active, checkedAt: "2026-07-28T00:00:00.000Z" };
}

test("camera re-framing is only reported while Toki is reading hands", () => {
  const on = { gesturesEnabled: true, cameraStatus: "active" };

  assert.equal(
    shouldWarnAboutCameraReframing({ reframing: state(true), ...on }),
    true,
  );

  // Nothing to say when it is off, or when the system could not be asked.
  assert.equal(
    shouldWarnAboutCameraReframing({ reframing: state(false), ...on }),
    false,
  );
  assert.equal(
    shouldWarnAboutCameraReframing({ reframing: state(null), ...on }),
    false,
  );
  assert.equal(
    shouldWarnAboutCameraReframing({
      reframing: initialCameraReframingState,
      ...on,
    }),
    false,
  );

  // Nor when Toki is not actually tracking.
  assert.equal(
    shouldWarnAboutCameraReframing({
      reframing: state(true),
      gesturesEnabled: false,
      cameraStatus: "active",
    }),
    false,
  );
  assert.equal(
    shouldWarnAboutCameraReframing({
      reframing: state(true),
      gesturesEnabled: true,
      cameraStatus: "disabled",
    }),
    false,
  );
});

test("the warning names the feature and where to turn it off", () => {
  assert.match(cameraReframingLabel, /Centre Stage/);
  assert.match(cameraReframingMessage, /Control Centre/);
  assert.match(cameraReframingMessage, /Video Effects/);
});

test("the re-framing warning outranks every gesture state in the top status", () => {
  const warnIndex = appSource.indexOf("if (cameraReframingActive)");
  const shutdownIndex = appSource.indexOf('cameraShutdown.phase === "holding"');
  const lockIndex = appSource.indexOf("if (pointerLock != null)");

  assert.ok(warnIndex >= 0, "the top status never reports camera re-framing");
  assert.ok(warnIndex < shutdownIndex);
  assert.ok(warnIndex < lockIndex);
});

test("the native probe is guarded and cannot report a false negative as off", () => {
  // Reading the state must never trap on a system without the selector.
  assert.match(nativeSource, /respondsToSelector:/);
  assert.match(nativeSource, /isCenterStageActive/);
  assert.match(nativeSource, /fn camera_reframing_status/);
  // Unknown is modelled as Option, not as false.
  assert.match(nativeSource, /fn macos_center_stage_active\(\) -> Option<bool>/);
  assert.match(runtimeSource, /camera_reframing_status/);
  // A failed probe must not surface as a warning.
  assert.match(runtimeSource, /catch \{\s*return \{ active: null/);
});
