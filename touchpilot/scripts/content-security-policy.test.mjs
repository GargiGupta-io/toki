import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const desktopSource = path.join(workspaceRoot, "apps", "desktop", "src");
const configPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "tauri.conf.json",
);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const csp = config.app?.security?.csp;

function directive(name) {
  const match = String(csp)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return match ?? "";
}

test("a content security policy is set at all", () => {
  assert.ok(
    typeof csp === "string" && csp.length > 0,
    "csp must not be null; without it the webview may load and run anything",
  );
  assert.match(directive("default-src"), /'self'/u);
});

test("WebAssembly is permitted because hand tracking depends on it", () => {
  // MediaPipe's hand tracking is WebAssembly. Without this the module fails to
  // instantiate and gesture tracking stops with no visible error -- the exact
  // silent failure this test exists to prevent.
  assert.match(directive("script-src"), /'wasm-unsafe-eval'/u);
});

test("inline styles are permitted because components rely on them", () => {
  // Assert against real usage rather than taste: if no component used inline
  // styles this allowance should be removed, and this test should fail.
  const usesInlineStyles = ["BlobCursor.tsx", "TokiTaskProgress.tsx"].some(
    (file) =>
      readFileSync(path.join(desktopSource, file), "utf8").includes("style={{"),
  );
  assert.ok(usesInlineStyles, "expected at least one component with inline styles");
  assert.match(directive("style-src"), /'unsafe-inline'/u);
});

test("screenshots can render because they are data URLs", () => {
  const app = readFileSync(path.join(desktopSource, "App.tsx"), "utf8");
  assert.match(app, /src=\{`data:image\//u, "screenshots render as data URLs");
  assert.match(directive("img-src"), /data:/u);
});

test("the Tauri bridge is reachable", () => {
  // Every invoke() call goes through this. Omitting it breaks the entire
  // front end to back end boundary, not merely one feature.
  const connect = directive("connect-src");
  assert.match(connect, /ipc:/u);
  assert.match(connect, /http:\/\/ipc\.localhost/u);
});

test("the policy allows no remote origin", () => {
  // MediaPipe's assets are bundled and checksum-pinned, and the OpenAI call is
  // made from Rust rather than the webview, so nothing in the page needs to
  // reach the network.
  //
  // When the hosted backend arrives, its origin must be added to connect-src
  // here. requestRealGuidance() fetches from VITE_TOKI_GUIDANCE_ENDPOINT in the
  // webview, so it will be blocked by this policy until that happens.
  assert.doesNotMatch(csp, /https:\/\//u, "no remote https origin is permitted");
  assert.doesNotMatch(csp, /\*/u, "no wildcard origins");
});

test("dangerous sinks stay closed", () => {
  assert.match(directive("object-src"), /'none'/u);
  assert.match(directive("base-uri"), /'self'/u);
  assert.match(directive("frame-ancestors"), /'none'/u);
  // 'unsafe-eval' would re-open arbitrary code execution that
  // 'wasm-unsafe-eval' deliberately keeps narrow.
  assert.doesNotMatch(directive("script-src"), /'unsafe-eval'/u);
});

test("a hand tracking failure is visible without the debug window", () => {
  const app = readFileSync(path.join(desktopSource, "App.tsx"), "utf8");

  // The whole risk of this policy is a silent failure: block the WebAssembly
  // and gesture tracking simply stops, looking to a user exactly like a hand
  // Toki cannot see. The failure state existed only in DebugWindowApp, which
  // is not shipped, so it has to be surfaced in the overlay status too.
  assert.match(app, /handLandmarkerFailed/u);
  assert.match(app, /Gesture tracking unavailable/u);

  const statusBuilder = app.slice(0, app.indexOf("function OverlayWindowApp"));
  assert.ok(
    statusBuilder.includes("handLandmarkerFailed"),
    "the status must be decided outside the debug window component",
  );

  // Ranked above the re-framing warning: if the model never loaded, no other
  // explanation is true.
  assert.ok(
    app.indexOf("if (handLandmarkerFailed)") <
      app.indexOf("if (cameraReframingActive)"),
    "a missing model outranks the re-framing warning",
  );
});

test("MediaPipe assets stay local, which is what lets the policy be strict", () => {
  const handLandmarker = readFileSync(
    path.join(desktopSource, "handLandmarker.ts"),
    "utf8",
  );
  assert.doesNotMatch(handLandmarker, /https?:\/\//u);
  assert.match(handLandmarker, /document\.baseURI/u);
});
