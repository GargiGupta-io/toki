import { rankScreenCandidates } from "./candidate-ranking.mjs";

const fallbackCandidates = [
  {
    id: "ax-search-field-1",
    label: "Search",
    role: "AXTextField",
    source: "accessibility",
    x: 120,
    y: 88,
    width: 320,
    height: 36,
  },
  {
    id: "ax-download-button-1",
    label: "Download",
    role: "AXButton",
    source: "accessibility",
    x: 1080,
    y: 420,
    width: 112,
    height: 42,
  },
  {
    id: "ax-browser-window-1",
    label: "Browser window",
    role: "AXWindow",
    source: "accessibility",
    x: 0,
    y: 0,
    width: 1470,
    height: 956,
  },
  {
    id: "ocr-invite-1",
    label: "Invite",
    role: "ocr_text",
    source: "ocr",
    x: 1180,
    y: 310,
    width: 76,
    height: 28,
  },
  {
    id: "ocr-revoke-1",
    label: "Revoke",
    role: "ocr_text",
    source: "ocr",
    x: 1210,
    y: 560,
    width: 74,
    height: 24,
  },
  {
    id: "ocr-download-1",
    label: "Download",
    role: "ocr_text",
    source: "ocr",
    x: 1088,
    y: 430,
    width: 90,
    height: 20,
  },
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function expectTopLabel(goal, expectedLabel, candidates = fallbackCandidates) {
  const ranked = rankScreenCandidates(candidates, {
    goal,
    maxCandidates: 5,
  });
  const top = ranked[0];

  if (top?.label !== expectedLabel) {
    fail(`${goal} ranked ${top?.label ?? "nothing"} first; expected ${expectedLabel}`);
    return;
  }

  pass(`${goal} -> ${top.label} (${top.source ?? top.role}) @ ${top.x},${top.y}`);
}

console.log("Toki OCR/AX fallback known-screen QA");

expectTopLabel("Download the report", "Download");
expectTopLabel("Invite a team member", "Invite");
expectTopLabel("Search for a project", "Search");

const noBrowserCandidates = fallbackCandidates.every(
  (candidate) => candidate.source !== "dom" && candidate.source !== "browser-extension",
);

if (!noBrowserCandidates) {
  fail("fallback fixture should not include browser DOM candidates");
} else {
  pass("fallback fixture uses only Accessibility and OCR candidates");
}

if (process.exitCode == null || process.exitCode === 0) {
  console.log("\nOCR/AX fallback known-screen QA passed.");
}
