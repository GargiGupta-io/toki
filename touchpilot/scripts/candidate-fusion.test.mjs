import assert from "node:assert/strict";
import test from "node:test";

import { fuseCandidateEvidence } from "../apps/desktop/src/candidateFusion.ts";

test("fuseCandidateEvidence deduplicates matching cross-source evidence", () => {
  const result = fuseCandidateEvidence(
    [
      {
        id: "ax-download",
        label: "Download",
        role: "accessibility_element",
        source: "accessibility",
        x: 100,
        y: 80,
        width: 120,
        height: 42,
      },
      {
        id: "ocr-download",
        label: "Download",
        role: "ocr_text",
        source: "ocr",
        x: 104,
        y: 84,
        width: 110,
        height: 32,
      },
      {
        id: "dom-download",
        label: "Download",
        role: "dom_button",
        source: "dom",
        x: 101,
        y: 81,
        width: 118,
        height: 40,
      },
    ],
    "none",
    "2026-07-11T00:00:00.000Z",
  );

  assert.equal(result.candidateSource, "fused");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, "dom-download");
  assert.equal(result.candidates[0].source, "dom");
  assert.equal(result.candidates[0].metadata.fusionEvidenceCount, 3);
  assert.equal(
    result.candidates[0].metadata.fusionSources,
    "accessibility,ocr,browser-dom",
  );
  assert.equal(result.candidateEvidence.rawCount, 3);
  assert.equal(result.candidateEvidence.validCount, 3);
  assert.equal(result.candidateEvidence.fusedCount, 1);
  assert.deepEqual(result.candidateEvidence.sourceCounts, {
    accessibility: 1,
    ocr: 1,
    dom: 1,
    manual: 0,
    unknown: 0,
  });
});

test("fuseCandidateEvidence keeps distinct visual targets separate", () => {
  const result = fuseCandidateEvidence(
    [
      {
        id: "ax-save-top",
        label: "Save",
        role: "accessibility_element",
        source: "accessibility",
        x: 20,
        y: 20,
        width: 80,
        height: 36,
      },
      {
        id: "ocr-save-bottom",
        label: "Save",
        role: "ocr_text",
        source: "ocr",
        x: 20,
        y: 520,
        width: 80,
        height: 36,
      },
    ],
    "none",
  );

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidateEvidence.fusedCount, 2);
});

test("fuseCandidateEvidence rejects malformed candidates without hiding the count", () => {
  const result = fuseCandidateEvidence(
    [
      {
        id: "valid-manual",
        label: "Continue",
        role: "manual",
        source: "manual",
        x: 40,
        y: 40,
        width: 100,
        height: 40,
      },
      {
        id: "invalid-zero-width",
        label: "Broken",
        role: "ocr_text",
        source: "ocr",
        x: 10,
        y: 10,
        width: 0,
        height: 20,
      },
    ],
    "none",
  );

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidateSource, "manual");
  assert.equal(result.candidateEvidence.rawCount, 2);
  assert.equal(result.candidateEvidence.validCount, 1);
  assert.equal(result.candidateEvidence.sourceCounts.ocr, 0);
});

test("fuseCandidateEvidence preserves an empty collector source", () => {
  const result = fuseCandidateEvidence([], "unavailable");

  assert.equal(result.candidateSource, "unavailable");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.candidateEvidence.rawCount, 0);
});
