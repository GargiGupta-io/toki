import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeBrowserCandidatePayload,
  readBrowserCandidatePayload,
  readLatestBrowserCandidateBridge,
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
  assert.equal(result.candidates.length, 6);
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

test("readLatestBrowserCandidateBridge normalizes latest bridge payload", async () => {
  const result = await readLatestBrowserCandidateBridge("http://bridge.test/latest", {
    fetchImpl: async (url) => {
      assert.equal(url, "http://bridge.test/latest");

      return new Response(
        JSON.stringify({
          ok: true,
          payload: {
            schemaVersion: 1,
            source: "browser-extension",
            capturedAt: "2026-07-02T00:00:00.000Z",
            page: {
              url: "https://example.com",
              title: "Example",
            },
            viewport: {
              width: 1280,
              height: 720,
              scrollX: 0,
              scrollY: 0,
              devicePixelRatio: 2,
            },
            candidates: [
              {
                id: "dom-open-settings-1",
                label: "Open settings",
                role: "dom_button",
                source: "dom",
                x: 10,
                y: 20,
                width: 100,
                height: 32,
              },
            ],
          },
        }),
      );
    },
  });

  assert.equal(result.source, "browser-extension");
  assert.equal(result.candidates[0].label, "Open settings");
});

test("readLatestBrowserCandidateBridge returns null without payload", async () => {
  const result = await readLatestBrowserCandidateBridge("http://bridge.test/latest", {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, payload: null })),
  });

  assert.equal(result, null);
});
