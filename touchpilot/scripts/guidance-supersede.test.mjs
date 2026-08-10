import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { suggestionListPolicy } from "../apps/desktop/src/suggestionListLayout.ts";

const app = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);

/**
 * Saying it again, when Toki heard it wrong.
 *
 * Speech gets misheard -- "quote reply" arrived as "code reply" -- and the
 * person who notices says it again straight away. Toki used to answer that
 * with "Guidance is already analyzing the screen. Wait for the current request
 * to finish": refusing the correction in favour of the mistake, and making
 * somebody wait for an answer to a question they already knew was wrong.
 *
 * These assertions read the source because the behaviour lives inside a React
 * component's own request function, which cannot be imported on its own. They
 * are deliberately narrow: each one names a single thing that must be true, so
 * a failure says which guarantee went rather than that a file changed.
 */

test("a newer request is not refused because an older one is running", () => {
  // Asserted as a boolean rather than with doesNotMatch, because a failing
  // doesNotMatch against a file this size prints the entire file and buries
  // the one line that matters.
  const refuses = /setGuidanceProviderError\(\s*\n?\s*"Guidance is already analyzing/u.test(
    app,
  );

  assert.equal(
    refuses,
    false,
    "asking again must never be turned down in favour of the request in flight",
  );
});

test("a request carries a generation, and checks it before writing", () => {
  assert.match(app, /guidanceGenerationRef/u, "requests must be numbered");
  assert.match(
    app,
    /const isSuperseded = \(\) => guidanceGenerationRef\.current !== generation/u,
  );

  // Three places matter: the answer, the failure, and the busy flag. An
  // abandoned run that writes any of them undoes the newer one.
  const checks = app.match(/if \(!?isSuperseded\(\)\)/gu) ?? [];
  assert.ok(
    checks.length >= 3,
    `expected the stale check at the answer, the error and the finally; found ${checks.length}`,
  );
});

test("a new question clears the offers made for the old one", () => {
  // Otherwise the corrected command can be read as choosing from a list that
  // belonged to the misheard one.
  const start = app.indexOf("async function refreshCaptureMetadata");
  assert.ok(start > 0);

  const body = app.slice(start, start + 3000);
  assert.match(body, /setPendingSuggestions\(\[\]\)/u);
});

/**
 * And the offers have to be legible.
 *
 * They were put in the notch, which is one line and truncates. Three
 * suggestions arrived as "1. Comment options menu button -- say which one, or
 * s…", so the second and third were never seen.
 */

test("the notch no longer tries to hold the list", () => {
  assert.doesNotMatch(
    app,
    /describeSuggestions/u,
    "the list belongs on the screen, not in a one-line status",
  );
});

test("the list is drawn on screen, beside the blob", () => {
  assert.match(app, /<TokiSuggestionList/u);
  assert.match(app, /suggestions=\{pendingSuggestions\}/u);
});

test("the list is sized to be read rather than glanced at", () => {
  // Wide enough for a control name plus a few words about it.
  assert.ok(suggestionListPolicy.widthPx >= 280);
  assert.ok(suggestionListPolicy.widthPx <= 420, "not a second window");

  // Room for a label and a reason on every entry.
  assert.ok(suggestionListPolicy.entryHeightPx >= 40);
});

test("the list takes no clicks", () => {
  const css = readFileSync(
    new URL("../apps/desktop/src/TokiSuggestionList.css", import.meta.url),
    "utf8",
  );

  // The overlay covers the whole display. A panel that swallowed a click would
  // break the application underneath it, which is the one thing Toki must not
  // do -- and it is exactly what was reported when the overlay stopped clicks
  // reaching another app.
  assert.match(css, /pointer-events:\s*none/u);
});

test("the list is pinned where it appeared, not tied to the moving blob", () => {
  // When guidance fails there is no target, so the blob follows the pointer.
  // A list anchored to it would slide across the screen after the cursor while
  // somebody was trying to read it.
  assert.match(app, /suggestionAnchor/u);
  assert.match(
    app,
    /setSuggestionAnchor\(\(current\) => current \?\? blobPositionRef\.current\)/u,
    "the anchor must be taken once, not refreshed",
  );
  assert.match(app, /blob=\{\s*suggestionAnchor == null/u);
});

test("the offers outlive the error line, and still expire", () => {
  const failure = Number(
    /GUIDANCE_FAILURE_VISIBLE_MS = ([\d_]+)/u.exec(app)?.[1].replace(/_/gu, ""),
  );
  const offers = Number(
    /GUIDANCE_SUGGESTIONS_VISIBLE_MS = ([\d_]+)/u
      .exec(app)?.[1]
      .replace(/_/gu, ""),
  );

  // A report can go after eight seconds. A question you are expected to answer
  // out loud cannot.
  assert.ok(offers > failure, "offers must last longer than the error line");
  assert.ok(offers >= 20_000, "long enough to read three entries and answer");

  // But nothing Toki draws over somebody's work sits there for good.
  assert.ok(Number.isFinite(offers) && offers <= 60_000);
});
