import type { ScreenCandidate } from "@toki/shared";

import type { EvalExpectedRanking } from "./schema";
import { normalizeTargetLabel } from "./targetScoring";

export type RankedCandidate = ScreenCandidate & {
  evalRank: number;
};

export type CandidateSourceBreakdown = Record<string, number>;

export type CandidateRankingScoreResult = {
  candidateFound: boolean;
  actualRank: number | null;
  top1: boolean;
  top3: boolean;
  withinMaxRank: boolean;
  labelMatch: boolean;
  sourceBreakdown: CandidateSourceBreakdown;
  passed: boolean;
  failures: string[];
};

function getCandidateIdentity(candidate: ScreenCandidate): string {
  return candidate.candidateId ?? candidate.id;
}

export function getRankedCandidates(
  candidates: ScreenCandidate[],
): RankedCandidate[] {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      evalRank: candidate.rank?.position ?? index + 1,
    }))
    .sort((a, b) => a.evalRank - b.evalRank);
}

export function getCandidateSourceBreakdown(
  candidates: ScreenCandidate[],
): CandidateSourceBreakdown {
  return candidates.reduce<CandidateSourceBreakdown>((breakdown, candidate) => {
    const source = candidate.source ?? candidate.role;
    breakdown[source] = (breakdown[source] ?? 0) + 1;
    return breakdown;
  }, {});
}

export function findRankedCandidate(
  candidates: ScreenCandidate[],
  candidateId: string,
): RankedCandidate | null {
  return (
    getRankedCandidates(candidates).find(
      (candidate) => getCandidateIdentity(candidate) === candidateId,
    ) ?? null
  );
}

export function scoreCandidateRanking(
  candidates: ScreenCandidate[],
  expected: EvalExpectedRanking,
): CandidateRankingScoreResult {
  const sourceBreakdown = getCandidateSourceBreakdown(candidates);
  const candidate = findRankedCandidate(candidates, expected.candidateId);
  const failures: string[] = [];

  if (!candidate) {
    return {
      candidateFound: false,
      actualRank: null,
      top1: false,
      top3: false,
      withinMaxRank: false,
      labelMatch: false,
      sourceBreakdown,
      passed: false,
      failures: [`missing candidate: ${expected.candidateId}`],
    };
  }

  const actualRank = candidate.evalRank;
  const top1 = actualRank === 1;
  const top3 = actualRank <= 3;
  const withinMaxRank = actualRank <= expected.maxRank;
  const labelMatch =
    normalizeTargetLabel(candidate.label) ===
    normalizeTargetLabel(expected.label);

  if (!withinMaxRank) {
    failures.push(`rank ${actualRank} > max ${expected.maxRank}`);
  }

  if (!labelMatch) {
    failures.push(
      `label mismatch: expected ${expected.label}, got ${candidate.label}`,
    );
  }

  return {
    candidateFound: true,
    actualRank,
    top1,
    top3,
    withinMaxRank,
    labelMatch,
    sourceBreakdown,
    passed: failures.length === 0,
    failures,
  };
}
