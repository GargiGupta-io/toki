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
const WEAK_REGION_ROLE_RE = /(window|application|group|toolbar|menubar|region)/i;
const SOURCE_TRUST = new Map([
  ["dom", 14],
  ["browser-extension", 14],
  ["manual", 12],
  ["accessibility", 8],
  ["ocr", 4],
]);

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

function hasExactLabelMatch(label, goal) {
  const labelText = normalizeText(label);
  const goalText = normalizeText(goal);

  return labelText.length >= 3 && goalText.includes(labelText);
}

function hasRiskWord(label) {
  const tokens = tokenize(label);

  return tokens.some((token) => RISK_WORDS.has(token));
}

function sourceTrust(candidate) {
  const source = normalizeText(candidate.source);
  const role = normalizeText(candidate.role);

  if (source === "dom" || role.startsWith("dom_")) {
    return SOURCE_TRUST.get("dom");
  }

  if (source === "manual" || role === "manual") {
    return SOURCE_TRUST.get("manual");
  }

  if (source === "accessibility" || role.startsWith("ax")) {
    return SOURCE_TRUST.get("accessibility");
  }

  if (source === "ocr" || role === "ocr_text") {
    return SOURCE_TRUST.get("ocr");
  }

  return 0;
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
  const sourceScore = sourceTrust(candidate);

  if (sourceScore > 0) {
    score += sourceScore;
    reasons.push(`source-trust:${sourceScore}`);
  }

  if (hasExactLabelMatch(candidate.label, context.goal)) {
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

  if (width >= 24 && height >= 16 && area <= 90_000) {
    score += 6;
    reasons.push("button-sized");
  }

  if (width > 500 || height > 160) {
    score -= 14;
    reasons.push("large-region");
  }

  if (candidate.metadata?.visible === false || candidate.metadata?.hidden === true) {
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
