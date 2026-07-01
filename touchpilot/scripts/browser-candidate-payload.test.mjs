import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeBrowserCandidatePayload,
  readBrowserCandidatePayload,
} from "./browser-candidate-payload.mjs";

const fixturePath = join(
  "apps",
  "browser-extension",
  "fixtures",
  "bridge-payload.json",
);

test("readBrowserCandidatePayload normalizes extension payloads", async () => {
  const result = await readBrowserCandidatePayload(fixturePath);

  assert.equal(result.source, "browser-extension");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].label, "Create project");
  assert.equal(result.candidates[0].role, "dom_button");
  assert.equal(result.candidates[0].source, "dom");
});

test("normalizeBrowserCandidatePayload rejects non-extension payloads", () => {
  assert.throws(
    () => normalizeBrowserCandidatePayload({ schemaVersion: 1, source: "ocr" }),
    /schemaVersion 1/,
  );
});
