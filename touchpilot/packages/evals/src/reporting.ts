import type { CandidateRankingScoreResult } from "./rankingScoring";
import type { SafetyScoreResult } from "./safetyScoring";
import type { TargetScoreResult } from "./targetScoring";
import type {
  WorkflowTransitionScoreResult,
  WorkflowVerificationScoreResult,
} from "./workflowScoring";
import type {
  ProviderComparisonCaseResult,
  ProviderComparisonStatus,
} from "./providerComparison";

export type EvalReportStatus = "passed" | "failed" | "skipped";

export type EvalReportCase = {
  id: string;
  title: string;
  status: EvalReportStatus;
  target?: TargetScoreResult;
  ranking?: CandidateRankingScoreResult;
  safety?: SafetyScoreResult;
  workflow?: WorkflowVerificationScoreResult | WorkflowTransitionScoreResult;
  provider?: ProviderComparisonCaseResult;
  failures: string[];
};

export type EvalReportSummary = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type EvalReport = {
  title: string;
  generatedAt: string;
  summary: EvalReportSummary;
  cases: EvalReportCase[];
};

export function summarizeEvalReportCases(
  cases: EvalReportCase[],
): EvalReportSummary {
  return {
    total: cases.length,
    passed: cases.filter((testCase) => testCase.status === "passed").length,
    failed: cases.filter((testCase) => testCase.status === "failed").length,
    skipped: cases.filter((testCase) => testCase.status === "skipped").length,
  };
}

export function createEvalReport(input: {
  title: string;
  cases: EvalReportCase[];
  generatedAt?: string;
}): EvalReport {
  return {
    title: input.title,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: summarizeEvalReportCases(input.cases),
    cases: input.cases,
  };
}

function formatStatus(status: EvalReportStatus | ProviderComparisonStatus): string {
  return status.toUpperCase();
}

function formatMaybeNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "n/a";
}

function formatCaseFailureLines(testCase: EvalReportCase): string[] {
  const failures = [...testCase.failures];

  if (testCase.target && !testCase.target.passed) {
    failures.push(
      ...testCase.target.failures.map((failure) => `target: ${failure}`),
    );
  }

  if (testCase.ranking && !testCase.ranking.passed) {
    failures.push(
      ...testCase.ranking.failures.map((failure) => `ranking: ${failure}`),
    );
  }

  if (testCase.safety && !testCase.safety.passed) {
    failures.push(
      ...testCase.safety.failures.map((failure) => `safety: ${failure}`),
    );
  }

  if (testCase.workflow && !testCase.workflow.passed) {
    failures.push(
      ...testCase.workflow.failures.map((failure) => `workflow: ${failure}`),
    );
  }

  if (testCase.provider && testCase.provider.status === "failed") {
    failures.push(
      ...testCase.provider.failures.map((failure) => `provider: ${failure}`),
    );
  }

  if (testCase.provider?.skipReason) {
    failures.push(`provider skipped: ${testCase.provider.skipReason}`);
  }

  return [...new Set(failures)];
}

export function formatEvalReport(report: EvalReport): string {
  const lines = [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Total | Passed | Failed | Skipped |",
    "| ---: | ---: | ---: | ---: |",
    `| ${report.summary.total} | ${report.summary.passed} | ${report.summary.failed} | ${report.summary.skipped} |`,
    "",
    "| Case | Status | Target | Ranking | Safety | Workflow | Provider |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const testCase of report.cases) {
    const target = testCase.target
      ? `IoU ${formatMaybeNumber(testCase.target.iou)}, d ${formatMaybeNumber(
          testCase.target.centerDistance,
        )}`
      : "-";
    const ranking = testCase.ranking
      ? `rank ${testCase.ranking.actualRank ?? "n/a"}, top3 ${
          testCase.ranking.top3 ? "yes" : "no"
        }`
      : "-";
    const safety = testCase.safety
      ? `${testCase.safety.actualAction}/${testCase.safety.actualRisk}`
      : "-";
    const workflow = testCase.workflow
      ? testCase.workflow.passed
        ? "passed"
        : "failed"
      : "-";
    const provider = testCase.provider
      ? `${testCase.provider.providerName} ${formatStatus(testCase.provider.status)}`
      : "-";

    lines.push(
      `| ${testCase.id} | ${formatStatus(
        testCase.status,
      )} | ${target} | ${ranking} | ${safety} | ${workflow} | ${provider} |`,
    );
  }

  const failureLines = report.cases.flatMap((testCase) =>
    formatCaseFailureLines(testCase).map(
      (failure) => `- ${testCase.id}: ${failure}`,
    ),
  );

  if (failureLines.length > 0) {
    lines.push("", "## Failures", "", ...failureLines);
  }

  return `${lines.join("\n")}\n`;
}
