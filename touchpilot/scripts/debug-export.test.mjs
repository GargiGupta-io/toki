import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sanitizeDebugExportValue } from "../apps/desktop/src/debugExport.ts";

test("debug export strips binary payloads but preserves diagnostic metadata", () => {
  const sanitized = sanitizeDebugExportValue({
    screenshotCapture: {
      imageBase64: "c2NyZWVuc2hvdA==",
      byteLength: 10,
      capturedAt: "2026-07-18T12:00:00.000Z",
    },
    voice: {
      audioBase64: "YXVkaW8=",
      status: "listening",
    },
    provider: {
      rawAnswer: "The visible plus button is the requested target.",
    },
  });

  assert.deepEqual(sanitized, {
    screenshotCapture: {
      imageBase64: { omitted: true, encodedLength: 16 },
      byteLength: 10,
      capturedAt: "2026-07-18T12:00:00.000Z",
    },
    voice: {
      audioBase64: { omitted: true, encodedLength: 8 },
      status: "listening",
    },
    provider: {
      rawAnswer: "The visible plus button is the requested target.",
    },
  });
});

test("debug export redacts secret-shaped fields without hiding trace identifiers", () => {
  const sanitized = sanitizeDebugExportValue({
    authorization: "Bearer private",
    apiKey: "private",
    accessToken: "private",
    traceId: "trace-visible",
    candidateId: "candidate-visible",
  });

  assert.deepEqual(sanitized, {
    authorization: "[redacted]",
    apiKey: "[redacted]",
    accessToken: "[redacted]",
    traceId: "trace-visible",
    candidateId: "candidate-visible",
  });
});

test("debug export handles circular diagnostic objects safely", () => {
  const diagnostic = { phase: "active" };
  diagnostic.self = diagnostic;

  assert.deepEqual(sanitizeDebugExportValue(diagnostic), {
    phase: "active",
    self: "[circular reference omitted]",
  });
});

/*
 * Keeping the one moment worth reading.
 *
 * The history has always held a compact summary per transition, and everything
 * that explains a failure -- the per-stage trace, the provider's own words, the
 * ranked candidates, the payload gate -- lived only in the snapshot file, which
 * is overwritten twice a second. So the interesting moment was gone before
 * anyone could read it, and the file that survived said `null` where the answer
 * had been.
 *
 * That is the difference between diagnosing a failure from the record and
 * asking somebody to photograph a window.
 */

test("a failed transition carries the whole guidance picture", () => {
  const source = readFileSync(
    new URL("../apps/desktop/src/debugExport.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /readGuidanceFailureDetail/u);

  for (const key of [
    "guidanceTrace",
    "guidanceProviderDebug",
    "guidanceRequest",
    "guidanceResult",
    "captureMetadata",
  ]) {
    assert.ok(
      source.includes(`"${key}"`),
      `${key} is part of what explains a failure`,
    );
  }
});

test("an ordinary transition stays a summary", () => {
  // Attaching a full snapshot to every transition would put megabytes a minute
  // on somebody's disk to record nothing going wrong.
  const source = readFileSync(
    new URL("../apps/desktop/src/debugExport.ts", import.meta.url),
    "utf8",
  );
  const reader = source.slice(source.indexOf("function readGuidanceFailureDetail"));

  assert.match(reader.slice(0, 700), /if \(!failed\) \{\s*\n\s*return undefined;/u);
});

test("the detail is sanitised like everything else", () => {
  // It contains the guidance request, and the guidance request contains a
  // picture of somebody's screen.
  const source = readFileSync(
    new URL("../apps/desktop/src/debugExport.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /detail: sanitizeDebugExportValue\(detail\)/u);
});

test("images and audio never reach the file", () => {
  // The standing rule, restated here because the failure detail is a new way
  // for a payload to get in.
  const source = readFileSync(
    new URL("../apps/desktop/src/debugExport.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /omittedPayloadKeys = new Set\(\["imageBase64", "audioBase64"\]\)/u);
});
