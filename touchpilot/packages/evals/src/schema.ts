import type {
  RiskClass,
  SafetyPolicyAction,
  ScreenCandidate,
  TargetBox,
  WorkflowVerificationResult,
} from "@toki/shared";

export type EvalCaseKind =
  | "target"
  | "candidate_ranking"
  | "risk"
  | "workflow";

export type EvalFixtureSource =
  | {
      type: "browser-candidate-payload";
      path: string;
    }
  | {
      type: "screenshot";
      path: string;
    }
  | {
      type: "inline-candidates";
      candidates: ScreenCandidate[];
    };

export type EvalExpectedTarget = TargetBox & {
  candidateId: string;
  minIoU?: number;
  maxCenterDistance?: number;
};

export type EvalExpectedRanking = {
  candidateId: string;
  label: string;
  maxRank: number;
};

export type EvalExpectedSafety = {
  action: SafetyPolicyAction;
  risk: RiskClass;
};

export type EvalExpectedWorkflow = {
  status: WorkflowVerificationResult["status"];
  matchedCandidateIds?: string[];
};

export type EvalExpectedResult = {
  target?: EvalExpectedTarget;
  ranking?: EvalExpectedRanking;
  safety?: EvalExpectedSafety;
  workflow?: EvalExpectedWorkflow;
};

export type EvalCase = {
  id: string;
  kind: EvalCaseKind;
  title: string;
  goal: string;
  fixture: EvalFixtureSource;
  expected: EvalExpectedResult;
  tags?: string[];
};

export type EvalDataset = {
  schemaVersion: 1;
  name: string;
  description: string;
  cases: EvalCase[];
};

export function defineEvalDataset(dataset: EvalDataset): EvalDataset {
  return dataset;
}
