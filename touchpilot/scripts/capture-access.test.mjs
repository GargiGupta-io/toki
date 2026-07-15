import assert from "node:assert/strict";
import test from "node:test";
import {
  requireScreenCaptureAccess,
  SCREEN_CAPTURE_ACCESS_REQUIRED_MESSAGE,
} from "../apps/desktop/src/captureAccess.ts";

test("trusted Screen Recording preflight allows capture to continue", () => {
  assert.doesNotThrow(() => requireScreenCaptureAccess(true));
});

test("untrusted Screen Recording preflight fails before wallpaper pixels reach vision", () => {
  assert.throws(
    () => requireScreenCaptureAccess(false),
    (error) =>
      error instanceof Error && error.message === SCREEN_CAPTURE_ACCESS_REQUIRED_MESSAGE,
  );
});
