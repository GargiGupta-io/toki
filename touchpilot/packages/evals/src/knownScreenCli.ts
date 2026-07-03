import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BrowserCandidatePayload,
  GuidanceProviderResponse,
  RiskClass,
  ScreenCandidate,
  TargetBox,
} from "@toki/shared";

import { knownScreenEvalDataset } from "./fixtures";
import type { EvalCase } from "./schema";
import { scoreCandidateRanking } from "./rankingScoring";
import { scoreSafetyPolicy } from "./safetyScoring";
import { scoreTargetMatch } from "./targetScoring";

type CaseResult = {
  id: string;
  passed: boolean;
  failures: string[];
};

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function normalizeCandidateRole(candidate: ScreenCandidate): ScreenCandidate {
  if (candidate.role !== ("dom_textbox" as ScreenCandidate["role"])) {
    return candidate;
  }

  const tagName =
    typeof candidate.metadata?.tagName === "string"
      ? candidate.metadata.tagName.toLowerCase()
      : "";

  return {
    ...candidate,
    role: tagName === "textarea" ? "dom_textarea" : "dom_input",
  };
}

async function loadBrowserFixture(path: string): Promise<BrowserCandidatePayload> {
  const fixturePath = resolve(repoRoot, path);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
    candidates?: ScreenCandidate[];
  };

  if (!Array.isArray(fixture.candidates)) {
    throw new Error(`Fixture has no candidates: ${path}`);
  }

  return {
    ...(fixture as BrowserCandidatePayload),
    candidates: fixture.candidates.map(normalizeCandidateRole),
  };
}

function findCandidate(
  candidates: ScreenCandidate[],
  candidateId: string,
): ScreenCandidate | null {
  return candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

function candidateToTarget(candidate: ScreenCandidate | null): TargetBox | null {
  return candidate
    ? {
        candidateId: candidate.id,
        label: candidate.label,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      }
    : null;
}

function createProviderResponse(
  target: TargetBox | null,
  risk: RiskClass,
): GuidanceProviderResponse {
  if (!target) {
    return {
      mode: "unavailable",
      error: "Expected target candidate was missing from the fixture.",
    };
  }

  return {
    mode: "mock",
    result: {
      mode: "guide",
      summary: `Known-screen fixture selected ${target.label}.`,
      step: {
        instruction: `Click ${target.label}.`,
        target,
        confidence: 0.95,
        risk,
        requiresConfirmation: risk !== "safe_navigation" && risk !== "form_entry",
      },
    },
    validation: {
      valid: true,
      issues: [],
    },
    providerName: "known-screen-fixture",
  };
}

async function scoreCase(testCase: EvalCase): Promise<CaseResult> {
  if (testCase.fixture.type !== "browser-candidate-payload") {
    return {
      id: testCase.id,
      passed: false,
      failures: [`unsupported fixture type: ${testCase.fixture.type}`],
    };
  }

  const fixture = await loadBrowserFixture(testCase.fixture.path);
  const failures: string[] = [];
  let target: TargetBox | null = null;

  if (testCase.expected.target) {
    target = candidateToTarget(
      findCandidate(fixture.candidates, testCase.expected.target.candidateId),
    );
    const targetScore = scoreTargetMatch(target, testCase.expected.target);

    failures.push(...targetScore.failures.map((failure) => `target: ${failure}`));
  }

  if (testCase.expected.ranking) {
    const rankingScore = scoreCandidateRanking(
      fixture.candidates,
      testCase.expected.ranking,
    );

    failures.push(
      ...rankingScore.failures.map((failure) => `ranking: ${failure}`),
    );
  }

  if (testCase.expected.safety) {
    const policyScore = scoreSafetyPolicy(
      createProviderResponse(target, testCase.expected.safety.risk),
      testCase.expected.safety,
    );

    failures.push(...policyScore.failures.map((failure) => `safety: ${failure}`));
  }

  return {
    id: testCase.id,
    passed: failures.length === 0,
    failures,
  };
}

async function main(): Promise<void> {
  console.log("Toki known-screen eval");
  console.log(`Dataset: ${knownScreenEvalDataset.name}`);

  const results = await Promise.all(
    knownScreenEvalDataset.cases.map((testCase) => scoreCase(testCase)),
  );

  for (const result of results) {
    console.log(`${result.passed ? "[PASS]" : "[FAIL]"} ${result.id}`);

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const failed = results.filter((result) => !result.passed);
  console.log(
    `Summary: ${results.length - failed.length}/${results.length} passed`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
