import type { ScreenCandidate } from "@toki/shared";

const MAX_RANKED_CANDIDATES = 20;
const RISK_WORDS = new Set([
  "delete",
  "remove",
  "revoke",
  "pay",
  "send",
  "transfer",
  "security",
  "password",
  "permission",
  "admin",
  "billing",
]);
const CLICKABLE_ROLE_RE =
  /(button|link|menu item|checkbox|radio|textbox|text field|tab|cell|row)/i;

type RankedCandidate = ScreenCandidate & {
  rank?: {
    score: number;
    position: number;
    reasons: string[];
  };
};

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function countMatchingTokens(label: string, goalTokens: string[]): number {
  const labelText = normalizeText(label);

  return goalTokens.filter((token) => labelText.includes(token)).length;
}

function hasRiskWord(label: string): boolean {
  return tokenize(label).some((token) => RISK_WORDS.has(token));
}

export function rankScreenCandidates(
  candidates: ScreenCandidate[] | undefined,
  goal: string,
  maxCandidates = MAX_RANKED_CANDIDATES,
): RankedCandidate[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const goalTokens = tokenize(goal);
  const labelCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const label = normalizeText(candidate.label);

    if (label.length > 0) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }

  return candidates
    .map((candidate, index) => {
      const matchCount = countMatchingTokens(candidate.label, goalTokens);
      const role = normalizeText(candidate.role);
      const area = candidate.width * candidate.height;
      const duplicateCount = labelCounts.get(normalizeText(candidate.label)) ?? 1;
      let score = 0;
      const reasons: string[] = [];

      if (matchCount > 0) {
        score += matchCount * 12;
        reasons.push(`goal-text:${matchCount}`);
      }

      if (CLICKABLE_ROLE_RE.test(role)) {
        score += 10;
        reasons.push("clickable-role");
      }

      if (role === "ocr_text") {
        score += 4;
        reasons.push("ocr-visible");
      }

      if (candidate.width >= 24 && candidate.height >= 16 && area <= 90_000) {
        score += 6;
        reasons.push("button-sized");
      }

      if (candidate.width > 500 || candidate.height > 160) {
        score -= 10;
        reasons.push("large-region");
      }

      if (duplicateCount > 1) {
        score -= Math.min(10, duplicateCount * 2);
        reasons.push(`duplicate:${duplicateCount}`);
      }

      if (hasRiskWord(candidate.label)) {
        score -= 4;
        reasons.push("risk-word");
      }

      score -= index * 0.05;

      return {
        ...candidate,
        rank: {
          score: Math.round(score * 100) / 100,
          position: 0,
          reasons,
        },
      };
    })
    .sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0))
    .slice(0, Math.max(1, maxCandidates))
    .map((candidate, index) => ({
      ...candidate,
      rank: {
        score: candidate.rank?.score ?? 0,
        reasons: candidate.rank?.reasons ?? [],
        position: index + 1,
      },
    }));
}
