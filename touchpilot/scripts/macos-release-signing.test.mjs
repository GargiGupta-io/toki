import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const signingScriptPath = path.join(scriptsDirectory, "macos-sign-app.sh");
const entitlementsPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "Toki.entitlements",
);

const requiredReleaseEntitlements = [
  "com.apple.security.device.camera",
  "com.apple.security.device.audio-input",
];

// Entitlements that must never appear. The sandbox would sever screen capture
// and the accessibility APIs Toki reads targets from, and the other two widen
// the hardened runtime for capabilities this bundle provably does not use.
const forbiddenEntitlements = [
  "com.apple.security.app-sandbox",
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.disable-library-validation",
];

function readSigningScript() {
  return readFileSync(signingScriptPath, "utf8");
}

function sliceFunction(script, name) {
  const start = script.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} must exist in macos-sign-app.sh`);
  const end = script.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return script.slice(start, end);
}

// Comments explain which flags are deliberately absent, so they mention the
// very strings these assertions forbid. Only executable lines are evidence.
function stripComments(source) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

test("release entitlements claim exactly the capabilities Toki uses", () => {
  const entitlements = readFileSync(entitlementsPath, "utf8");

  for (const key of requiredReleaseEntitlements) {
    assert.match(
      entitlements,
      new RegExp(`<key>${key.replace(/\./gu, "\\.")}</key>\\s*<true/>`, "u"),
      `${key} must be claimed for the hardened runtime`,
    );
  }

  for (const key of forbiddenEntitlements) {
    assert.doesNotMatch(
      entitlements,
      new RegExp(`<key>${key.replace(/\./gu, "\\.")}</key>`, "u"),
      `${key} must not be claimed`,
    );
  }
});

test("release entitlements parse under AMFI's stricter XML reader", () => {
  const entitlements = readFileSync(entitlementsPath, "utf8");

  // codesign hands this file to AMFI, whose XML reader rejects a doubled
  // hyphen inside a comment where plutil accepts it. The failure surfaces only
  // when signing actually runs, as:
  //   Failed to parse entitlements: AMFIUnserializeXML: syntax error near line N
  // Guarding the file content catches it at test time instead of release time.
  const comments = entitlements.match(/<!--[\s\S]*?-->/gu) ?? [];
  for (const comment of comments) {
    const body = comment.slice("<!--".length, -"-->".length);
    assert.doesNotMatch(
      body,
      /--/u,
      "a doubled hyphen inside an XML comment makes codesign reject this file",
    );
  }
});

test("signing script derives the release mode from the Developer ID identity", () => {
  const script = readSigningScript();

  // Deriving the mode from the identity name means the release flags cannot be
  // forgotten. A separate opt-in flag fails silently: the app signs, installs,
  // and runs, and only notarization rejects it.
  assert.match(script, /is_release_identity\(\)/u);
  assert.match(script, /"\$SIGNING_IDENTITY" == "Developer ID Application:"\*/u);
});

test("release signing hardens the bundle and local signing stays untouched", () => {
  const signFunction = sliceFunction(readSigningScript(), "sign_app");

  assert.match(signFunction, /--options runtime/u);
  assert.match(signFunction, /--entitlements "\$ENTITLEMENTS_PATH"/u);

  // The trusted timestamp and the local opt-out must live on opposite sides of
  // the branch: a self-signed certificate cannot be timestamped, so applying
  // --timestamp unconditionally would break every debug install.
  assert.match(signFunction, /is_release_identity; then/u);
  const releaseBranch = signFunction.slice(
    signFunction.indexOf("is_release_identity; then"),
    signFunction.indexOf("  else"),
  );
  const localBranch = signFunction.slice(signFunction.indexOf("  else"));
  assert.match(releaseBranch, /--timestamp\b/u);
  assert.doesNotMatch(releaseBranch, /--timestamp=none/u);
  assert.match(localBranch, /--timestamp=none/u);
  assert.doesNotMatch(localBranch, /--options runtime/u);
});

test("signing never uses --deep while verification still does", () => {
  const script = readSigningScript();
  const signFunction = stripComments(sliceFunction(script, "sign_app"));

  // --deep would stamp the release entitlements onto any nested code it found.
  // The bundle has a single Mach-O image and no nested frameworks, so it buys
  // nothing and Apple deprecates it for signing. Verification is unaffected.
  assert.doesNotMatch(signFunction, /--deep/u);
  assert.match(script, /codesign --verify --deep --strict/u);
});

test("release verification rejects the failures codesign --verify cannot see", () => {
  const script = readSigningScript();
  const verifyFunction = sliceFunction(script, "verify_release_hardening");

  // An app with no hardened runtime, no timestamp, and no entitlements passes
  // `codesign --verify` cleanly. Each one is a notarization rejection.
  assert.match(verifyFunction, /\(runtime\)/u);
  assert.match(verifyFunction, /Timestamp=/u);
  assert.match(verifyFunction, /codesign -d --entitlements/u);
  assert.match(verifyFunction, /REQUIRED_RELEASE_ENTITLEMENTS/u);

  assert.match(
    sliceFunction(script, "verify_signed_app"),
    /is_release_identity/u,
    "verify_signed_app must apply the release checks on the Developer ID path",
  );
});

test("the script and the entitlements file agree on the claimed capabilities", () => {
  const script = readSigningScript();
  const entitlements = readFileSync(entitlementsPath, "utf8");
  const declared = script.slice(
    script.indexOf("REQUIRED_RELEASE_ENTITLEMENTS=("),
    script.indexOf(")", script.indexOf("REQUIRED_RELEASE_ENTITLEMENTS=(")),
  );

  for (const key of requiredReleaseEntitlements) {
    assert.match(declared, new RegExp(`"${key.replace(/\./gu, "\\.")}"`, "u"));
    assert.ok(entitlements.includes(key));
  }
});
