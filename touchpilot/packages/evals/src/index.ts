export { knownScreenEvalDataset } from "./fixtures";
export type {
  Point,
  TargetScoreMetrics,
  TargetScoreResult,
} from "./targetScoring";
export {
  getCenterDistance,
  getIntersectionOverUnion,
  getTargetCenter,
  isPointInsideTarget,
  normalizeTargetLabel,
  scoreTargetMatch,
} from "./targetScoring";
export type {
  EvalCase,
  EvalCaseKind,
  EvalDataset,
  EvalExpectedRanking,
  EvalExpectedResult,
  EvalExpectedSafety,
  EvalExpectedTarget,
  EvalExpectedWorkflow,
  EvalFixtureSource,
} from "./schema";
export { defineEvalDataset } from "./schema";
