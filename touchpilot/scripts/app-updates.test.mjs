import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  describeUpdateState,
  initialUpdateCheckState,
} from "../apps/desktop/src/appUpdates.ts";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const tauriDirectory = path.join(workspaceRoot, "apps", "desktop", "src-tauri");
const config = JSON.parse(
  readFileSync(path.join(tauriDirectory, "tauri.conf.json"), "utf8"),
);
const capability = JSON.parse(
  readFileSync(
    path.join(tauriDirectory, "capabilities", "default.json"),
    "utf8",
  ),
);

test("every window that calls Rust is granted a capability", () => {
  // A window missing here has no permissions at all, so every invoke() from it
  // is denied. The preferences window was added without this and its buttons
  // would silently have done nothing.
  const declared = config.app.windows.map((window) => window.label);
  for (const label of declared) {
    assert.ok(
      capability.windows.includes(label),
      `window "${label}" is declared but has no capability, so invoke() will fail from it`,
    );
  }
});

test("the updater is configured with a host and a verification key", () => {
  const updater = config.plugins?.updater;
  assert.ok(updater, "no updater configuration");
  assert.ok(
    Array.isArray(updater.endpoints) && updater.endpoints.length > 0,
    "an update host is required or the app can never be updated",
  );
  assert.match(updater.endpoints[0], /^https:\/\//u, "updates must use https");
  assert.ok(
    typeof updater.pubkey === "string" && updater.pubkey.length > 0,
    "without a public key any file could be installed as an update",
  );
});

test("the configured key is the public half, not the private one", () => {
  const decoded = Buffer.from(config.plugins.updater.pubkey, "base64").toString(
    "utf8",
  );
  assert.match(decoded, /minisign public key/u);
  assert.doesNotMatch(decoded, /secret key/u);
});

test("updater artifacts are actually produced by the build", () => {
  // Without this the release contains no update payload, so the app checks for
  // updates forever and never finds one.
  assert.equal(config.bundle.createUpdaterArtifacts, true);
});

test("no private signing key exists anywhere in the repository", () => {
  // The private key can sign anything the app will install. It lives outside
  // the repo, and this fails loudly if a copy is ever added -- especially
  // relevant because this repository is public.
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  for (const file of tracked) {
    if (/\.(key|pem|p12)$/u.test(file)) {
      assert.fail(`key-shaped file is tracked: ${file}`);
    }
  }

  const suspicious = tracked.filter((file) =>
    /updater\.key|minisign|signing-key/iu.test(file),
  );
  assert.deepEqual(suspicious, [], "signing key material must never be tracked");
});

test("update states read as plain sentences", () => {
  assert.equal(describeUpdateState(initialUpdateCheckState), "");
  assert.match(describeUpdateState({ status: "current" }), /up to date/u);
  assert.match(
    describeUpdateState({ status: "available", version: "1.2.0", notes: null }),
    /1\.2\.0 is available/u,
  );
  assert.match(
    describeUpdateState({ status: "ready", version: "1.2.0" }),
    /Restart to finish/u,
  );
});

test("a failed update check is reported rather than swallowed", () => {
  // An update mechanism that quietly stops working looks exactly like one with
  // nothing to offer, and the difference only shows up when a fix fails to
  // reach anybody.
  const message = describeUpdateState({
    status: "failed",
    message: "network unreachable",
  });
  assert.match(message, /Could not check for updates/u);
  assert.match(message, /network unreachable/u);
});
