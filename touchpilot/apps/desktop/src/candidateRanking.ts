import type { ScreenCandidate } from "@toki/shared";
import { scoreCandidateIntent } from "./candidateIntent";

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
  /(button|link|menu item|menuitem|checkbox|radio|textbox|text field|tab|cell|row|accessibility_element)/i;
const WEAK_REGION_ROLE_RE = /(window|application|group|toolbar|menubar|region)/i;
const SOURCE_TRUST = new Map<string, number>([
  ["dom", 14],
  ["browser-extension", 14],
  ["manual", 12],
  ["accessibility", 18],
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
    ? value
        .trim()
        .toLowerCase()
        .replace(/\+/g, " plus ")
        .replace(/\s+/g, " ")
    : "";
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function countMatchingTokens(label: string, goalTokens: string[]): number {
  const labelTokens = new Set(tokenize(label));

  return goalTokens.filter((token) => labelTokens.has(token)).length;
}

function hasExactLabelMatch(label: string, goal: string): boolean {
  const labelText = normalizeText(label);
  const goalText = normalizeText(goal);
  const goalTokens = tokenize(goalText);

  if (labelText.length < 3) {
    return false;
  }

  return labelText.includes(" ")
    ? ` ${goalText} `.includes(` ${labelText} `)
    : goalTokens.includes(labelText);
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

/**
 * Choose which candidates are actually sent, when the score cannot choose.
 *
 * Nothing in a list of ninety usually matches the words somebody said, and when
 * nothing matches, every candidate scores within half a point of every other --
 * they are all just "a clickable thing of about button size". The tie-break was
 * document order, so the twenty that went to the model were the first twenty in
 * the page.
 *
 * On a browser that is the tab strip. Every candidate came back at y=33, forty
 * pixels tall, and not one control from the page itself was offered as
 * evidence, whatever the question was.
 *
 * So: anything that earned its place by matching the request keeps it. The rest
 * of the slots go to whatever is furthest from what has already been chosen.
 * Twenty controls spread across the window say something about where things
 * are; twenty packed into one strip say almost nothing, and cost the same.
 */
function selectWithCoverage(
  sorted: RankedCandidate[],
  maxCandidates: number,
): RankedCandidate[] {
  const limit = Math.max(1, maxCandidates);

  if (sorted.length <= limit) {
    return sorted;
  }

  const earned = sorted.filter((candidate) => (candidate.rank?.relevance ?? 0) > 0);
  const chosen = earned.slice(0, limit);
  const remaining = sorted.filter((candidate) => !chosen.includes(candidate));

  const centre = (candidate: RankedCandidate) => ({
    x: candidate.x + candidate.width / 2,
    y: candidate.y + candidate.height / 2,
  });

  while (chosen.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = -1;

    for (let index = 0; index < remaining.length; index += 1) {
      const at = centre(remaining[index]);
      let nearest = Infinity;

      for (const picked of chosen) {
        const other = centre(picked);
        nearest = Math.min(nearest, Math.hypot(at.x - other.x, at.y - other.y));
      }

      // Nothing chosen yet: the highest scoring one leads, and `remaining` is
      // already in score order.
      if (nearest === Infinity) {
        bestIndex = 0;
        break;
      }

      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestIndex = index;
      }
    }

    chosen.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return chosen;
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
      /**
       * How much of the score was earned by matching the request.
       *
       * Tracked apart from the total because the two answer different
       * questions. The total says "is this a plausible control"; this says "is
       * this control anything to do with what was asked". Only the second one
       * justifies a place in a list of twenty.
       */
      let relevance = 0;
      const reasons: string[] = [];
      const sourceScore = sourceTrust(candidate);

      if (sourceScore > 0) {
        score += sourceScore;
        reasons.push(`source-trust:${sourceScore}`);
      }

      if (hasExactLabelMatch(candidate.label, goal)) {
        score += 18;
        relevance += 18;
        reasons.push("exact-label");
      }

      if (matchCount > 0) {
        score += matchCount * 12;
        relevance += matchCount * 12;
        reasons.push(`goal-text:${matchCount}`);
      }

      const intentScore = scoreCandidateIntent(candidate, goal);

      score += intentScore.score;
      relevance += intentScore.score;
      reasons.push(...intentScore.reasons);

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

      if (duplicateCount > 1 && candidate.source !== "accessibility") {
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
          relevance: Math.round(relevance * 100) / 100,
          position: 0,
          reasons,
        },
      };
    })
    .sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0))
    .reduce<RankedCandidate[]>(
      (kept, _candidate, _index, sorted) =>
        kept.length > 0 ? kept : selectWithCoverage(sorted, maxCandidates),
      [],
    )
    .map((candidate, index) => ({
      ...candidate,
      rank: {
        score: candidate.rank?.score ?? 0,
        relevance: candidate.rank?.relevance ?? 0,
        reasons: candidate.rank?.reasons ?? [],
        position: index + 1,
      },
    }));
}
