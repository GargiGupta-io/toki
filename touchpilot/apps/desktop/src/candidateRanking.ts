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
  /(button|link|menu item|menuitem|checkbox|radio|textbox|text field|tab|cell|row|accessibility_element)/i;
const WEAK_REGION_ROLE_RE = /(window|application|group|toolbar|menubar|region)/i;
const SOURCE_TRUST = new Map<string, number>([
  ["dom", 14],
  ["browser-extension", 14],
  ["manual", 12],
  ["accessibility", 18],
  ["ocr", 4],
]);
const ACTION_SYNONYMS: Array<{
  goal: string[];
  label: string[];
  reason: string;
}> = [
  {
    goal: ["new", "make", "create", "add"],
    label: ["new", "make", "create", "add", "plus", "button"],
    reason: "create-action",
  },
  {
    goal: ["new", "make", "create", "add", "playlist", "list"],
    label: ["playlist", "library", "collection", "folder", "queue"],
    reason: "playlist-context",
  },
  {
    goal: ["open", "view", "show"],
    label: ["open", "view", "show"],
    reason: "open-action",
  },
  {
    goal: ["download", "save"],
    label: ["download", "save"],
    reason: "download-action",
  },
  {
    goal: ["search", "find"],
    label: ["search", "find"],
    reason: "search-action",
  },
  {
    goal: ["settings", "permission", "permissions"],
    label: ["settings", "permission", "permissions", "privacy"],
    reason: "settings-action",
  },
];

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

function getActionSynonymScore(
  labelTokens: string[],
  goalTokens: string[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const synonym of ACTION_SYNONYMS) {
    const goalMatches = synonym.goal.some((token) => goalTokens.includes(token));
    const labelMatches = synonym.label.some((token) => labelTokens.includes(token));

    if (goalMatches && labelMatches) {
      score += 10;
      reasons.push(synonym.reason);
    }
  }

  return { score, reasons };
}

function getIconActionScore(
  labelTokens: string[],
  goalTokens: string[],
  role: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const wantsCreate = ["new", "make", "create", "add"].some((token) =>
    goalTokens.includes(token),
  );
  const wantsCollection = ["playlist", "list", "collection", "library"].some(
    (token) => goalTokens.includes(token),
  );
  const looksLikeCreateControl = ["add", "create", "new", "plus"].some((token) =>
    labelTokens.includes(token),
  );
  const isButtonLike = CLICKABLE_ROLE_RE.test(role);

  if (wantsCreate && looksLikeCreateControl && isButtonLike) {
    score += 16;
    reasons.push("icon-create-control");
  }

  if (wantsCreate && wantsCollection && looksLikeCreateControl && isButtonLike) {
    score += 12;
    reasons.push("collection-create-target");
  }

  return { score, reasons };
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
      const labelTokens = tokenize(candidate.label);
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

      const synonymScore = getActionSynonymScore(labelTokens, goalTokens);

      if (synonymScore.score > 0) {
        score += synonymScore.score;
        reasons.push(...synonymScore.reasons);
      }

      const iconActionScore = getIconActionScore(labelTokens, goalTokens, role);

      if (iconActionScore.score > 0) {
        score += iconActionScore.score;
        reasons.push(...iconActionScore.reasons);
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
