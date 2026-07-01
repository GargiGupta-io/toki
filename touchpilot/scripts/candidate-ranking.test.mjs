import assert from "node:assert/strict";
import test from "node:test";
import { rankScreenCandidates } from "./candidate-ranking.mjs";

const candidates = [
  {
    id: "decorative-title",
    label: "Dashboard",
    role: "ocr_text",
    x: 20,
    y: 20,
    width: 620,
    height: 180,
  },
  {
    id: "download-button",
    label: "Download",
    role: "AXButton",
    x: 1200,
    y: 540,
    width: 128,
    height: 44,
  },
  {
    id: "info-1",
    label: "Info",
    role: "ocr_text",
    x: 1000,
    y: 620,
    width: 60,
    height: 24,
  },
  {
    id: "info-2",
    label: "Info",
    role: "ocr_text",
    x: 1000,
    y: 720,
    width: 60,
    height: 24,
  },
];

test("rankScreenCandidates prioritizes matching clickable targets", () => {
  const ranked = rankScreenCandidates(candidates, {
    goal: "Click the download button",
  });

  assert.equal(ranked[0].id, "download-button");
  assert.ok(ranked[0].rank.score > ranked[1].rank.score);
  assert.ok(ranked[0].rank.reasons.includes("clickable-role"));
  assert.ok(ranked[0].rank.reasons.some((reason) => reason.startsWith("goal-text")));
});

test("rankScreenCandidates penalizes duplicate generic labels", () => {
  const ranked = rankScreenCandidates(candidates, {
    goal: "Click info",
  });
  const info = ranked.filter((candidate) => candidate.label === "Info");

  assert.equal(info.length, 2);
  assert.ok(info[0].rank.reasons.includes("duplicate:2"));
});

test("rankScreenCandidates limits returned candidates", () => {
  const ranked = rankScreenCandidates(candidates, {
    goal: "open dashboard info download",
    maxCandidates: 2,
  });

  assert.equal(ranked.length, 2);
  assert.deepEqual(
    ranked.map((candidate) => candidate.rank.position),
    [1, 2],
  );
});
