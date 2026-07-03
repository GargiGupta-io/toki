import type {
  WorkflowStatus,
  WorkflowVerificationResult,
} from "@toki/shared";

import type { EvalExpectedWorkflow } from "./schema";

export type WorkflowVerificationScoreResult = {
  expectedStatus: EvalExpectedWorkflow["status"];
  actualStatus: WorkflowVerificationResult["status"];
  expectedMatchedCandidateIds: string[];
  actualMatchedCandidateIds: string[];
  passed: boolean;
  failures: string[];
};

export type WorkflowTransitionKind =
  | "next"
  | "back"
  | "blocked"
  | "completed"
  | "confirmation_required";

export type WorkflowTransitionSnapshot = {
  beforeStepIndex: number;
  afterStepIndex: number;
  beforeStatus?: WorkflowStatus;
  afterStatus: WorkflowStatus;
  requiresConfirmation?: boolean;
};

export type WorkflowTransitionScoreResult = {
  kind: WorkflowTransitionKind;
  passed: boolean;
  failures: string[];
};

export function scoreWorkflowVerification(
  actual: WorkflowVerificationResult | null | undefined,
  expected: EvalExpectedWorkflow,
): WorkflowVerificationScoreResult {
  const failures: string[] = [];
  const actualStatus = actual?.status ?? "untested";
  const expectedMatchedCandidateIds = expected.matchedCandidateIds ?? [];
  const actualMatchedCandidateIds = actual?.matchedCandidateIds ?? [];

  if (actualStatus !== expected.status) {
    failures.push(
      `status mismatch: expected ${expected.status}, got ${actualStatus}`,
    );
  }

  for (const candidateId of expectedMatchedCandidateIds) {
    if (!actualMatchedCandidateIds.includes(candidateId)) {
      failures.push(`missing matched candidate: ${candidateId}`);
    }
  }

  return {
    expectedStatus: expected.status,
    actualStatus,
    expectedMatchedCandidateIds,
    actualMatchedCandidateIds,
    passed: failures.length === 0,
    failures,
  };
}

export function scoreWorkflowTransition(
  kind: WorkflowTransitionKind,
  snapshot: WorkflowTransitionSnapshot,
): WorkflowTransitionScoreResult {
  const failures: string[] = [];

  if (kind === "next") {
    if (snapshot.afterStepIndex !== snapshot.beforeStepIndex + 1) {
      failures.push(
        `next index mismatch: expected ${
          snapshot.beforeStepIndex + 1
        }, got ${snapshot.afterStepIndex}`,
      );
    }

    if (snapshot.afterStatus !== "active") {
      failures.push(`next status mismatch: got ${snapshot.afterStatus}`);
    }
  }

  if (kind === "back") {
    const expectedIndex = Math.max(0, snapshot.beforeStepIndex - 1);

    if (snapshot.afterStepIndex !== expectedIndex) {
      failures.push(
        `back index mismatch: expected ${expectedIndex}, got ${snapshot.afterStepIndex}`,
      );
    }
  }

  if (kind === "blocked" && snapshot.afterStatus !== "blocked") {
    failures.push(`blocked status mismatch: got ${snapshot.afterStatus}`);
  }

  if (kind === "completed" && snapshot.afterStatus !== "completed") {
    failures.push(`completed status mismatch: got ${snapshot.afterStatus}`);
  }

  if (kind === "confirmation_required") {
    if (!snapshot.requiresConfirmation) {
      failures.push("step does not require confirmation");
    }

    if (snapshot.afterStatus !== "blocked") {
      failures.push(
        `confirmation-required status mismatch: got ${snapshot.afterStatus}`,
      );
    }
  }

  return {
    kind,
    passed: failures.length === 0,
    failures,
  };
}
