import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { interpretCommandIntent } from "../apps/desktop/src/candidateIntent.ts";

const corpusPath = fileURLToPath(
  new URL("../docs/manual-command-acceptance-matrix.md", import.meta.url),
);
const categoryCounts = new Map([
  ["SYN", 10],
  ["LEX", 10],
  ["AMB", 10],
  ["PTR", 10],
  ["NLU", 10],
  ["MLT", 10],
  ["SCR", 10],
  ["VIS", 10],
  ["RSK", 10],
  ["APP", 10],
  ["VOC", 10],
  ["GST", 10],
]);
const allowedResultPrefixes = new Set([
  "BLOCKED_PERMISSION",
  "CANCEL",
  "CLARIFY",
  "EXPLAIN",
  "LOCK",
  "NO_ACTION",
  "REFUSE",
  "TARGET",
  "TARGET_REVEAL",
  "VISUAL",
  "VOICE",
  "WORKFLOW",
]);

function parseCorpus(markdown) {
  return markdown
    .split("\n")
    .filter((line) => /^\| [A-Z]{3}-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());

      assert.equal(cells.length, 8, `Expected eight cells in: ${line}`);

      const [id, setup, utterance, expected, intent, cueSafety, automation, result] =
        cells;

      return {
        id,
        setup,
        utterance,
        expected,
        intent,
        cueSafety,
        automation,
        result,
      };
    });
}

test("manual command corpus contains 120 unique, complete cases", async () => {
  const cases = parseCorpus(await readFile(corpusPath, "utf8"));
  const ids = new Set(cases.map((entry) => entry.id));
  const utterancesBySetup = new Set(
    cases.map((entry) => `${entry.setup}\u0000${entry.utterance}`),
  );

  assert.equal(cases.length, 120);
  assert.equal(ids.size, cases.length, "case ids must be unique");
  assert.equal(
    utterancesBySetup.size,
    cases.length,
    "the same utterance/setup pair must not appear twice",
  );

  for (const entry of cases) {
    assert.ok(entry.setup.length > 0, `${entry.id} must define a setup`);
    assert.ok(entry.utterance.length > 0, `${entry.id} must define an utterance`);
    assert.ok(entry.expected.length > 0, `${entry.id} must define an expectation`);
    assert.match(entry.intent, /^[a-z_]+\/[a-z_]+$/);
    assert.match(entry.cueSafety, /^[a-z]+-[a-z]+$/);
    assert.ok(
      entry.automation === "intent" || entry.automation === "manual",
      `${entry.id} has invalid automation ${entry.automation}`,
    );
    assert.equal(entry.result, "NOT_RUN", `${entry.id} should start unexecuted`);

    const prefix = entry.expected.split(":", 1)[0];
    assert.ok(
      allowedResultPrefixes.has(prefix),
      `${entry.id} has unsupported expected-result prefix ${prefix}`,
    );
  }
});

test("every required edge-case category has ten cases", async () => {
  const cases = parseCorpus(await readFile(corpusPath, "utf8"));

  for (const [category, expectedCount] of categoryCounts) {
    const actualCount = cases.filter((entry) => entry.id.startsWith(`${category}-`))
      .length;
    assert.equal(actualCount, expectedCount, `${category} coverage changed`);
  }
});

test("intent-tagged corpus cases match the deterministic command parser", async () => {
  const cases = parseCorpus(await readFile(corpusPath, "utf8"));
  const intentCases = cases.filter((entry) => entry.automation === "intent");

  assert.ok(intentCases.length >= 35, "expected a meaningful deterministic subset");

  for (const entry of intentCases) {
    const [expectedAction, expectedObject] = entry.intent.split("/");
    const interpreted = interpretCommandIntent(entry.utterance);

    assert.equal(
      interpreted.action,
      expectedAction === "none" ? null : expectedAction,
      `${entry.id} action mismatch`,
    );
    assert.equal(
      interpreted.object,
      expectedObject === "none" ? null : expectedObject,
      `${entry.id} object mismatch`,
    );
  }
});
