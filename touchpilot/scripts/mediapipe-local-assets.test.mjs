import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  handLandmarkerAssetMode,
  resolveHandLandmarkerAssetUrls,
} from "../apps/desktop/src/handLandmarker.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRoot = join(repositoryRoot, "apps/desktop/public");
const handLandmarkerSource = readFileSync(
  join(repositoryRoot, "apps/desktop/src/handLandmarker.ts"),
  "utf8",
);

const expectedAssets = {
  "mediapipe/models/hand_landmarker.task":
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  "mediapipe/wasm/vision_wasm_internal.js":
    "e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c",
  "mediapipe/wasm/vision_wasm_internal.wasm":
    "6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc",
  "mediapipe/wasm/vision_wasm_module_internal.js":
    "1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44",
  "mediapipe/wasm/vision_wasm_module_internal.wasm":
    "617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756",
  "mediapipe/wasm/vision_wasm_nosimd_internal.js":
    "438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296",
  "mediapipe/wasm/vision_wasm_nosimd_internal.wasm":
    "8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31",
};

test("hand landmarker resolves assets beside the packaged application", () => {
  const urls = resolveHandLandmarkerAssetUrls("tauri://localhost/index.html");

  assert.equal(handLandmarkerAssetMode, "bundled");
  assert.deepEqual(urls, {
    wasmBaseUrl: "tauri://localhost/mediapipe/wasm",
    modelAssetUrl:
      "tauri://localhost/mediapipe/models/hand_landmarker.task",
  });
});

test("runtime source contains no remote MediaPipe asset endpoint", () => {
  assert.doesNotMatch(handLandmarkerSource, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(handLandmarkerSource, /storage\.googleapis\.com/);
  assert.doesNotMatch(handLandmarkerSource, /https?:\/\//);
  assert.match(handLandmarkerSource, /document\.baseURI/);
});

test("all bundled MediaPipe assets match their pinned checksums", () => {
  for (const [relativePath, expectedHash] of Object.entries(expectedAssets)) {
    const contents = readFileSync(join(publicRoot, relativePath));
    const actualHash = createHash("sha256").update(contents).digest("hex");

    assert.equal(actualHash, expectedHash, relativePath);
  }
});

test("bundled WebAssembly binaries compile without network access", async () => {
  const wasmPaths = Object.keys(expectedAssets).filter((path) =>
    path.endsWith(".wasm"),
  );

  for (const relativePath of wasmPaths) {
    const module = await WebAssembly.compile(
      readFileSync(join(publicRoot, relativePath)),
    );
    assert.ok(module instanceof WebAssembly.Module, relativePath);
  }
});

test("bundled loader scripts parse as standalone browser scripts", () => {
  const loaderPaths = Object.keys(expectedAssets).filter((path) =>
    path.endsWith(".js"),
  );

  for (const relativePath of loaderPaths) {
    const loaderPath = join(publicRoot, relativePath);
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ["--check", loaderPath]),
      relativePath,
    );
  }
});

test("hand model bundle contains both required detector models", () => {
  const modelBundle = readFileSync(
    join(publicRoot, "mediapipe/models/hand_landmarker.task"),
  );

  assert.equal(modelBundle.subarray(2, 6).toString("hex"), "504b0304");
  assert.ok(modelBundle.includes(Buffer.from("hand_detector.tflite")));
  assert.ok(modelBundle.includes(Buffer.from("hand_landmarks_detector.tflite")));
});

test("packaged third-party license and notice are present", () => {
  const license = readFileSync(
    join(publicRoot, "third-party/mediapipe/LICENSE.txt"),
    "utf8",
  );
  const notice = readFileSync(
    join(publicRoot, "third-party/mediapipe/NOTICE.txt"),
    "utf8",
  );

  assert.match(license, /Apache License/);
  assert.match(notice, /MediaPipe Tasks Vision 0\.10\.35/);
  assert.match(notice, /used locally by the installed application/);
});
