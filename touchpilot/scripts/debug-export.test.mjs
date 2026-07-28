import assert from "node:assert/strict";
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
