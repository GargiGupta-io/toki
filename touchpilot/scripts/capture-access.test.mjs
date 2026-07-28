import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  requireScreenCaptureAccess,
  SCREEN_CAPTURE_ACCESS_REQUIRED_MESSAGE,
} from "../apps/desktop/src/captureAccess.ts";

const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const nativeSource = readFileSync(
  new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);

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

test("missing Screen Recording access invokes the native macOS request path", () => {
  assert.match(
    appSource,
    /screen_capture_access_status[\s\S]*?if \(!hasScreenCaptureAccess\)[\s\S]*?request_screen_capture_access/,
  );
  assert.match(nativeSource, /fn CGRequestScreenCaptureAccess\(\)/);
  assert.match(nativeSource, /fn request_screen_capture_access\(\)/);
  assert.match(nativeSource, /request_screen_capture_access,[\s\S]*?hide_settings_window/);
});
