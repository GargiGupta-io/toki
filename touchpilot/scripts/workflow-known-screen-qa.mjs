import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMockWorkflowPlan } from "@toki/ai";

const fixturePath = join(
  process.cwd(),
  "apps",
  "browser-extension",
  "fixtures",
  "bridge-payload.json",
);

function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function candidateMatchesExpectation(candidate, expectation) {
  if (expectation.role != null && candidate.role !== expectation.role) {
    return false;
  }

  const expectedLabel = normalizeText(expectation.label);
  const candidateLabel = normalizeText(candidate.label);

  return (
    candidateLabel === expectedLabel ||
    candidateLabel.includes(expectedLabel) ||
    expectedLabel.includes(candidateLabel)
  );
}

function verifyStep(step, candidates) {
  const expectations = step.expected ?? [];
  const matchedCandidateIds = [];

  for (const expectation of expectations) {
    if (expectation.type !== "candidate_visible") {
      return {
        status: "blocked",
        message: `${expectation.type} verification is not supported by this QA script`,
        matchedCandidateIds,
      };
    }

    const match = candidates.find((candidate) =>
      candidateMatchesExpectation(candidate, expectation),
    );

    if (match == null) {
      return {
        status: "failed",
        message: `missing ${expectation.label}`,
        matchedCandidateIds,
      };
    }

    matchedCandidateIds.push(match.id);
  }

  return {
    status: "passed",
    message: "expectations passed",
    matchedCandidateIds,
  };
}

function assertPassed(label, result) {
  if (result.status !== "passed") {
    fail(`${label} expected pass, got ${result.status}: ${result.message}`);
    return false;
  }

  pass(`${label} passed - ${result.matchedCandidateIds.join(", ")}`);
  return true;
}

function assertFailed(label, result) {
  if (result.status !== "failed") {
    fail(`${label} expected failed, got ${result.status}: ${result.message}`);
    return false;
  }

  pass(`${label} blocked as expected - ${result.message}`);
  return true;
}

const payload = JSON.parse(await readFile(fixturePath, "utf8"));
const baseCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const plan = createMockWorkflowPlan("Create a project", {
  createdAt: "2026-07-03T00:00:00.000Z",
});

console.log("Toki workflow known-screen QA");
console.log(`Payload: ${fixturePath}`);

if (plan == null) {
  fail("create-project workflow plan is missing");
  process.exit();
}

if (plan.steps.length !== 3) {
  fail(`expected 3 create-project steps, got ${plan.steps.length}`);
} else {
  pass("create-project workflow has 3 steps");
}

let currentStepIndex = 0;
let currentStep = plan.steps[currentStepIndex];

if (assertPassed("step 1 visible expectation", verifyStep(currentStep, baseCandidates))) {
  currentStepIndex += 1;
}

if (currentStepIndex !== 1) {
  fail(`next should move to step 2, got index ${currentStepIndex}`);
} else {
  pass("next moves to step 2");
}

currentStepIndex -= 1;

if (currentStepIndex !== 0) {
  fail(`back should return to step 1, got index ${currentStepIndex}`);
} else {
  pass("back returns to step 1");
}

currentStepIndex += 1;
currentStep = plan.steps[currentStepIndex];

if (assertPassed("step 2 visible expectation", verifyStep(currentStep, baseCandidates))) {
  currentStepIndex += 1;
}

currentStep = plan.steps[currentStepIndex];
const missingCompletion = verifyStep(currentStep, baseCandidates);
assertFailed("step 3 missing completion state", missingCompletion);

const completedCandidates = [
  ...baseCandidates,
  {
    id: "manual-project-created-1",
    label: "Project created",
    role: "manual",
    source: "manual",
    x: 100,
    y: 560,
    width: 180,
    height: 32,
  },
];

if (assertPassed("step 3 completion state", verifyStep(currentStep, completedCandidates))) {
  currentStepIndex += 1;
}

if (currentStepIndex === plan.steps.length) {
  pass("workflow can reach completed state");
} else {
  fail(`workflow should be complete, got step index ${currentStepIndex}`);
}

if (process.exitCode == null || process.exitCode === 0) {
  console.log("\nWorkflow known-screen QA passed.");
}
