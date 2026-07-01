const DEFAULT_MAX_RANKED_CANDIDATES = 20;
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

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function countMatchingTokens(label, goalTokens) {
  const labelText = normalizeText(label);

  return goalTokens.filter((token) => labelText.includes(token)).length;
}

function hasRiskWord(label) {
  const tokens = tokenize(label);

  return tokens.some((token) => RISK_WORDS.has(token));
}

function scoreCandidate(candidate, index, context, duplicateCount) {
  const goalTokens = tokenize(context.goal);
  const matchCount = countMatchingTokens(candidate.label, goalTokens);
  const role = normalizeText(candidate.role);
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  const area = width * height;
  let score = 0;
  const reasons = [];

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

  if (width >= 24 && height >= 16 && area <= 90_000) {
    score += 6;
    reasons.push("button-sized");
  }

  if (width > 500 || height > 160) {
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
      reasons,
    },
  };
}

export function rankScreenCandidates(candidates, context = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const maxCandidates = Number.isFinite(context.maxCandidates)
    ? Math.max(1, context.maxCandidates)
    : DEFAULT_MAX_RANKED_CANDIDATES;
  const labelCounts = new Map();

  for (const candidate of candidates) {
    const label = normalizeText(candidate?.label);

    if (label.length > 0) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }

  return candidates
    .filter((candidate) => candidate != null && typeof candidate === "object")
    .map((candidate, index) =>
      scoreCandidate(
        candidate,
        index,
        context,
        labelCounts.get(normalizeText(candidate.label)) ?? 1,
      ),
    )
    .sort((a, b) => b.rank.score - a.rank.score)
    .slice(0, maxCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: {
        ...candidate.rank,
        position: index + 1,
      },
    }));
}
