import assert from "node:assert/strict";
import test from "node:test";

import { rankScreenCandidates } from "../apps/desktop/src/candidateRanking.ts";

/*
 * The ranking the app actually ships.
 *
 * There are two implementations of this: the TypeScript module the desktop
 * imports, and a JavaScript copy under scripts/ that the offline QA harnesses
 * use. The existing ranking tests exercise the copy, so until now nothing
 * tested the ordering that decides what a real request sends to the model.
 *
 * These test the shipping one. The duplication is a standing hazard and worth
 * removing, but silently testing the wrong one is the part that costs.
 */

/*
 * Twenty browser tabs and nothing from the page.
 *
 * Recorded from a real session: a request about a control on a GitHub pull
 * request, and every one of the twenty candidates sent as evidence was a
 * Firefox tab -- Firefox View, Your Repositories, Netflix, WhatsApp -- all at
 * y=33, forty pixels tall, scoring 33.9, 33.85, 33.75, 33.65 and so on.
 *
 * Those scores are a tell. They are 0.05 apart because the tie-break was
 * `score -= index * 0.05`, which is document order: nothing matched the words
 * that were said, everything scored the same as a plausible clickable control,
 * and the list was therefore simply the first twenty elements in the page.
 *
 * The model still had the screenshot, so this was not fatal -- but the evidence
 * that was supposed to help it was a description of the browser's tab bar,
 * whatever the question.
 */

function tabStrip(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ax-tab-${i}`,
    label: `Tab number ${i}`,
    role: "AXRadioButton",
    source: "accessibility",
    x: i * 40,
    y: 33,
    width: 40,
    height: 44,
  }));
}

function pageControls(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ax-page-${i}`,
    label: `Page control ${i}`,
    role: "AXButton",
    source: "accessibility",
    x: 300 + (i % 5) * 180,
    y: 400 + Math.floor(i / 5) * 120,
    width: 40,
    height: 24,
  }));
}

test("a request nothing matches still sees the whole window", () => {
  // The failure exactly as recorded: forty tabs first in document order, then
  // the page's own controls, and twenty slots.
  const ranked = rankScreenCandidates(
    [...tabStrip(40), ...pageControls(38)],
    "find the quote reply option",
    20,
  );

  assert.equal(ranked.length, 20);

  const fromPage = ranked.filter((candidate) => candidate.y > 100);
  assert.ok(
    fromPage.length > 0,
    "not one control from the page was offered as evidence",
  );

  // And not merely one token of it: a list that is still nine tenths tab strip
  // has the same problem in a politer form.
  assert.ok(
    fromPage.length >= 5,
    `only ${fromPage.length} of 20 came from the page`,
  );
});

test("candidates that match the request keep their places", () => {
  // Coverage is the tie-break, not the rule. Anything that earned its place by
  // matching the words said must not be displaced by something merely further
  // away from it.
  const ranked = rankScreenCandidates(
    [
      ...tabStrip(40),
      {
        id: "ax-quote-reply",
        label: "Quote reply",
        role: "AXButton",
        source: "accessibility",
        x: 900,
        y: 700,
        width: 90,
        height: 24,
      },
      ...pageControls(38),
    ],
    "find the quote reply option",
    20,
  );

  const match = ranked.find((candidate) => candidate.label === "Quote reply");

  assert.ok(match, "the control that was asked for must be sent");
  assert.equal(match.rank.position, 1, "and it leads the list");
  assert.ok(match.rank.relevance > 0, "its place was earned, not spatial");
});

test("relevance is recorded apart from the total score", () => {
  // The two answer different questions: whether this is a plausible control,
  // and whether it has anything to do with what was asked. Only the second
  // justifies a slot.
  const [matched] = rankScreenCandidates(
    [
      {
        id: "a",
        label: "Export CSV",
        role: "AXButton",
        source: "accessibility",
        x: 10,
        y: 10,
        width: 80,
        height: 24,
      },
    ],
    "export csv",
    5,
  );

  assert.ok(matched.rank.relevance > 0);
  assert.ok(matched.rank.score >= matched.rank.relevance);
});

test("nothing is dropped when everything fits", () => {
  const candidates = pageControls(6);
  const ranked = rankScreenCandidates(candidates, "anything at all", 20);

  assert.equal(ranked.length, candidates.length);
});
