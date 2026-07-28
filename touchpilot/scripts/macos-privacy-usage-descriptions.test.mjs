import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const sourcePlistPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "Info.plist",
);
const signingScriptPath = path.join(scriptsDirectory, "macos-sign-app.sh");
const signingBootstrapScriptPath = path.join(
  scriptsDirectory,
  "macos-bootstrap-signing-identity.sh",
);

const requiredUsageDescriptions = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSScreenCaptureUsageDescription",
];

function readPlistString(plist, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]+)</string>`, "u"),
  );

  return match?.[1]?.trim() ?? "";
}

test("macOS source bundle declares every privacy-sensitive capability", () => {
  const plist = readFileSync(sourcePlistPath, "utf8");

  for (const key of requiredUsageDescriptions) {
    const description = readPlistString(plist, key);
    assert.ok(description.length >= 20, `${key} must contain a meaningful description`);
  }
});

test("macOS signing refuses bundles missing a required privacy description", () => {
  const signingScript = readFileSync(signingScriptPath, "utf8");
  const signFunction = signingScript.slice(signingScript.indexOf("sign_app()"));

  assert.match(signingScript, /verify_privacy_usage_descriptions/u);
  for (const key of requiredUsageDescriptions) {
    assert.match(signingScript, new RegExp(`"${key}"`, "u"));
  }
  assert.ok(
    signFunction.indexOf('verify_privacy_usage_descriptions "$app_path"') <
      signFunction.indexOf("--force"),
    "privacy declarations must be checked before signing",
  );
});

test("macOS local builds require a persistent signing identity", () => {
  const signingScript = readFileSync(signingScriptPath, "utf8");
  const bootstrapScript = readFileSync(signingBootstrapScriptPath, "utf8");

  assert.match(signingScript, /Toki Local Development/u);
  assert.match(signingScript, /security find-identity -v -p codesigning/u);
  assert.doesNotMatch(signingScript, /--sign\s+-\b/u);
  assert.match(signingScript, /Ad-hoc signing is not allowed/u);
  assert.match(signingScript, /requirement.*cdhash/u);
  assert.match(signingScript, /ditto "\$BUILT_APP" "\$INSTALLED_APP"/u);
  assert.match(signingScript, /verify_signed_app "\$INSTALLED_APP"/u);
  assert.doesNotMatch(signingScript, /sign_app "\$INSTALLED_APP"/u);

  assert.match(bootstrapScript, /Toki Local Development/u);
  assert.match(bootstrapScript, /extendedKeyUsage = codeSigning/u);
  assert.match(bootstrapScript, /-T \/usr\/bin\/codesign/u);
  assert.doesNotMatch(bootstrapScript, /security import[^\n]*-A/u);
});
