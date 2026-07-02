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

test("rankScreenCandidates prefers exact trusted DOM targets over broad regions", () => {
  const ranked = rankScreenCandidates(
    [
      {
        id: "browser-window",
        label: "Download",
        role: "window",
        source: "accessibility",
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
      },
      {
        id: "dom-download",
        label: "Download",
        role: "dom_button",
        source: "dom",
        x: 1180,
        y: 520,
        width: 132,
        height: 44,
      },
    ],
    {
      goal: "Download the report",
    },
  );

  assert.equal(ranked[0].id, "dom-download");
  assert.ok(ranked[0].rank.reasons.includes("source-trust:14"));
  assert.ok(ranked[0].rank.reasons.includes("exact-label"));
  assert.ok(ranked[1].rank.reasons.includes("weak-region-role"));
});

test("rankScreenCandidates penalizes hidden and disabled candidates", () => {
  const ranked = rankScreenCandidates(
    [
      {
        id: "hidden-submit",
        label: "Submit",
        role: "dom_button",
        source: "dom",
        x: 200,
        y: 200,
        width: 96,
        height: 40,
        metadata: {
          hidden: true,
        },
      },
      {
        id: "visible-submit",
        label: "Submit",
        role: "dom_button",
        source: "dom",
        x: 200,
        y: 260,
        width: 96,
        height: 40,
      },
    ],
    {
      goal: "Submit the form",
    },
  );

  assert.equal(ranked[0].id, "visible-submit");
  assert.ok(ranked[1].rank.reasons.includes("not-visible"));
});

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
