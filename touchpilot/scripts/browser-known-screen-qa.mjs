import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rankScreenCandidates } from "./candidate-ranking.mjs";

const defaultPayloadPath = join(
  process.cwd(),
  "apps",
  "browser-extension",
  "fixtures",
  "bridge-payload.json",
);

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match == null ? null : match.slice(prefix.length);
}

function isUsableCandidate(candidate) {
  return (
    candidate != null &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    Number.isFinite(Number(candidate.x)) &&
    Number.isFinite(Number(candidate.y)) &&
    Number(candidate.width) > 0 &&
    Number(candidate.height) > 0
  );
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

const payloadPath =
  getArgValue("--payload") ??
  process.env.TOKI_BROWSER_CANDIDATE_PAYLOAD ??
  defaultPayloadPath;
const payload = JSON.parse(await readFile(payloadPath, "utf8"));
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const usableCandidates = candidates.filter(isUsableCandidate);

console.log("Toki browser known-screen QA");
console.log(`Payload: ${payloadPath}`);
console.log(`Page: ${payload.page?.title ?? "unknown"} - ${payload.page?.url ?? "unknown"}`);

if (payload.schemaVersion !== 1 || payload.source !== "browser-extension") {
  fail("payload must be a schemaVersion 1 browser-extension payload");
}

if (usableCandidates.length < 4) {
  fail(`expected at least 4 usable browser candidates, got ${usableCandidates.length}`);
} else {
  pass(`usable browser candidates - ${usableCandidates.length}`);
}

const cases = [
  {
    goal: "Create a project",
    expectedLabel: "Create project",
  },
  {
    goal: "Open settings",
    expectedLabel: "Open settings",
  },
  {
    goal: "Add notes",
    expectedLabel: "Add notes",
  },
  {
    goal: "Delete project",
    expectedLabel: "Delete project",
  },
];

for (const testCase of cases) {
  const ranked = rankScreenCandidates(usableCandidates, {
    goal: testCase.goal,
    maxCandidates: 5,
  });
  const top = ranked[0];

  if (top?.label !== testCase.expectedLabel) {
    fail(
      `${testCase.goal} ranked ${top?.label ?? "nothing"} first; expected ${testCase.expectedLabel}`,
    );
    continue;
  }

  pass(
    `${testCase.goal} -> ${top.label} @ ${top.x},${top.y} ${top.width}x${top.height}`,
  );
}

if (process.exitCode == null || process.exitCode === 0) {
  console.log("\nBrowser known-screen QA passed.");
}
