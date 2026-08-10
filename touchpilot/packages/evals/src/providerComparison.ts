import type {
  GuidanceProviderMode,
  GuidanceProviderResponse,
  TargetBox,
} from "@toki/shared";

import type { EvalCase } from "./schema";
import type { SafetyScoreResult } from "./safetyScoring";
import { scoreSafetyPolicy } from "./safetyScoring";
import type { TargetScoreResult } from "./targetScoring";
import { scoreTargetMatch } from "./targetScoring";

export type ProviderComparisonMode =
  | "mock"
  | "freellmapi-dev"
  | "gemini"
  | "unavailable";

export type ProviderComparisonStatus = "passed" | "failed" | "skipped";

export type ProviderComparisonInput = {
  provider: ProviderComparisonMode;
  providerName?: string;
  response?: GuidanceProviderResponse;
  skipReason?: string;
};

export type ProviderComparisonCaseResult = {
  provider: ProviderComparisonMode;
  providerName: string;
  caseId: string;
  status: ProviderComparisonStatus;
  providerMode: GuidanceProviderMode | "skipped";
  target?: TargetScoreResult;
  safety?: SafetyScoreResult;
  failures: string[];
  skipReason?: string;
};

export type ProviderComparisonSummary = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type ProviderComparisonReport = {
  results: ProviderComparisonCaseResult[];
  summary: ProviderComparisonSummary;
};

function getProviderName(input: ProviderComparisonInput): string {
  return input.providerName ?? input.response?.providerName ?? input.provider;
}

function getProviderTarget(response: GuidanceProviderResponse): TargetBox | null {
  return response.result?.step?.target ?? null;
}

export function compareProviderCase(
  testCase: EvalCase,
  input: ProviderComparisonInput,
): ProviderComparisonCaseResult {
  const providerName = getProviderName(input);

  if (input.skipReason || !input.response) {
    return {
      provider: input.provider,
      providerName,
      caseId: testCase.id,
      status: "skipped",
      providerMode: "skipped",
      failures: [],
      skipReason: input.skipReason ?? "provider response was not supplied",
    };
  }

  const failures: string[] = [];
  let target: TargetScoreResult | undefined;
  let safety: SafetyScoreResult | undefined;

  if (testCase.expected.target) {
    target = scoreTargetMatch(
      getProviderTarget(input.response),
      testCase.expected.target,
    );
    failures.push(...target.failures.map((failure) => `target: ${failure}`));
  }

  if (testCase.expected.safety) {
    safety = scoreSafetyPolicy(input.response, testCase.expected.safety);
    failures.push(...safety.failures.map((failure) => `safety: ${failure}`));
  }

  return {
    provider: input.provider,
    providerName,
    caseId: testCase.id,
    status: failures.length === 0 ? "passed" : "failed",
    providerMode: input.response.mode,
    target,
    safety,
    failures,
  };
}

export function summarizeProviderComparison(
  results: ProviderComparisonCaseResult[],
): ProviderComparisonSummary {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
}

export function compareProviderRuns(
  testCases: EvalCase[],
  inputs: ProviderComparisonInput[],
): ProviderComparisonReport {
  const results = inputs.flatMap((input) =>
    testCases.map((testCase) => compareProviderCase(testCase, input)),
  );

  return {
    results,
    summary: summarizeProviderComparison(results),
  };
}
