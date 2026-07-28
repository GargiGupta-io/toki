import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");

function readJsonVersion(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  return {
    source: relativePath,
    version: JSON.parse(readFileSync(filePath, "utf8")).version,
  };
}

function readCargoVersion(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  const contents = readFileSync(filePath, "utf8");
  // Only the first [package] version counts; dependency pins further down the
  // file also match a naive version pattern.
  const packageSection = contents.slice(contents.indexOf("[package]"));
  const match = packageSection.match(/^version\s*=\s*"([^"]+)"/mu);
  return { source: relativePath, version: match?.[1] };
}

const versionSources = [
  readJsonVersion("package.json"),
  readJsonVersion("apps/desktop/package.json"),
  readJsonVersion("apps/desktop/src-tauri/tauri.conf.json"),
  readCargoVersion("apps/desktop/src-tauri/Cargo.toml"),
];

test("every version source declares a version", () => {
  for (const { source, version } of versionSources) {
    assert.ok(
      typeof version === "string" && version.length > 0,
      `${source} must declare a version`,
    );
  }
});

test("all four version sources agree", () => {
  // The updater compares the running version against the published manifest.
  // If these drift, the app can decide it is permanently out of date and
  // reinstall the same build in a loop, which is miserable to diagnose from
  // the outside.
  const [first, ...rest] = versionSources;
  for (const entry of rest) {
    assert.equal(
      entry.version,
      first.version,
      `${entry.source} is ${entry.version} but ${first.source} is ${first.version}`,
    );
  }
});

test("the version is a plain semantic version", () => {
  // Tauri's updater compares versions semantically; a build suffix or a "v"
  // prefix would not order the way the manifest expects.
  assert.match(
    versionSources[0].version,
    /^\d+\.\d+\.\d+$/u,
    "version must be MAJOR.MINOR.PATCH with no prefix or suffix",
  );
});
