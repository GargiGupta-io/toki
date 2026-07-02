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
const WEAK_REGION_ROLE_RE = /(window|application|group|toolbar|menubar|region)/i;
const SOURCE_TRUST = new Map<string, number>([
  ["dom", 14],
  ["browser-extension", 14],
  ["manual", 12],
  ["accessibility", 8],
  ["ocr", 4],
]);

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

function hasExactLabelMatch(label: string, goal: string): boolean {
  const labelText = normalizeText(label);
  const goalText = normalizeText(goal);

  return labelText.length >= 3 && goalText.includes(labelText);
}

function hasRiskWord(label: string): boolean {
  return tokenize(label).some((token) => RISK_WORDS.has(token));
}

function sourceTrust(candidate: ScreenCandidate): number {
  const source = normalizeText(candidate.source);
  const role = normalizeText(candidate.role);

  if (source === "dom" || role.startsWith("dom_")) {
    return SOURCE_TRUST.get("dom") ?? 0;
  }

  if (source === "manual" || role === "manual") {
    return SOURCE_TRUST.get("manual") ?? 0;
  }

  if (source === "accessibility" || role.startsWith("ax")) {
    return SOURCE_TRUST.get("accessibility") ?? 0;
  }

  if (source === "ocr" || role === "ocr_text") {
    return SOURCE_TRUST.get("ocr") ?? 0;
  }

  return 0;
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
      const sourceScore = sourceTrust(candidate);

      if (sourceScore > 0) {
        score += sourceScore;
        reasons.push(`source-trust:${sourceScore}`);
      }

      if (hasExactLabelMatch(candidate.label, goal)) {
        score += 18;
        reasons.push("exact-label");
      }

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

      if (WEAK_REGION_ROLE_RE.test(role)) {
        score -= 12;
        reasons.push("weak-region-role");
      }

      if (candidate.width >= 24 && candidate.height >= 16 && area <= 90_000) {
        score += 6;
        reasons.push("button-sized");
      }

      if (candidate.width > 500 || candidate.height > 160) {
        score -= 14;
        reasons.push("large-region");
      }

      if (
        candidate.metadata?.visible === false ||
        candidate.metadata?.hidden === true
      ) {
        score -= 16;
        reasons.push("not-visible");
      }

      if (candidate.metadata?.disabled === true) {
        score -= 14;
        reasons.push("disabled");
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
