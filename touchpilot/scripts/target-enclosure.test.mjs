import assert from "node:assert/strict";
import test from "node:test";

import {
  snapTargetToEnclosingControl,
  targetEnclosurePolicy,
} from "../apps/desktop/src/targetEnclosure.ts";

/**
 * The box grows to the thing you click, and stops well short of the window.
 *
 * Reproduced from the report: a GitHub pull request page, where "Changes
 * reviewed" is a title inside a row that is itself one large button with a
 * chevron at the far right. The model boxed the words; the clickable thing is
 * the row.
 */

const display = { width: 1440, height: 900 };

const titleBox = {
  candidateId: "vision-target",
  label: "Changes reviewed",
  x: 328,
  y: 296,
  width: 188,
  height: 28,
};

const row = {
  id: "ax-row-3",
  role: "accessibility_element",
  label: "Changes reviewed, 2 changes requested by reviewers with write access",
  x: 250,
  y: 272,
  width: 1108,
  height: 100,
};

const wholeWindow = {
  id: "ax-window",
  role: "accessibility_element",
  label: "Firefox",
  x: 0,
  y: 0,
  width: 1440,
  height: 900,
};

test("a boxed label grows to the row that is actually clickable", () => {
  const { target, grewTo } = snapTargetToEnclosingControl(
    titleBox,
    [wholeWindow, row],
    display,
  );

  assert.equal(grewTo?.id, "ax-row-3");
  assert.deepEqual(
    { x: target.x, y: target.y, width: target.width, height: target.height },
    { x: 250, y: 272, width: 1108, height: 100 },
  );
});

test("the label and the candidate id survive the growth", () => {
  // The notch reads the label out. Swapping it for the container's
  // accessibility name would change the instruction the person is given.
  const { target } = snapTargetToEnclosingControl(titleBox, [row], display);

  assert.equal(target.label, "Changes reviewed");
  assert.equal(target.candidateId, "vision-target");
});

test("a window is never the answer, even though it contains everything", () => {
  const { target, grewTo } = snapTargetToEnclosingControl(
    titleBox,
    [wholeWindow],
    display,
  );

  assert.equal(grewTo, null);
  assert.deepEqual(target, titleBox);
});

test("a full-height sidebar is refused on height alone", () => {
  // Narrow enough to pass the area test, tall enough that a box around it
  // says nothing about where to click.
  const sidebar = {
    id: "ax-sidebar",
    role: "accessibility_element",
    label: "Navigation",
    x: 240,
    y: 0,
    width: 300,
    height: 880,
  };

  const { grewTo } = snapTargetToEnclosingControl(titleBox, [sidebar], display);

  assert.equal(grewTo, null);
});

test("recognised text never swallows a target", () => {
  // A paragraph containing the word "Save" is not a button.
  const paragraph = {
    id: "ocr-7",
    role: "ocr_text",
    label: "You can Save your work at any time from the File menu",
    x: 250,
    y: 272,
    width: 900,
    height: 90,
  };

  const { grewTo } = snapTargetToEnclosingControl(titleBox, [paragraph], display);

  assert.equal(grewTo, null);
});

test("the innermost clickable container wins", () => {
  const panel = {
    id: "ax-panel",
    role: "accessibility_element",
    label: "Merge box",
    x: 250,
    y: 260,
    width: 1108,
    height: 380,
  };

  const { grewTo } = snapTargetToEnclosingControl(
    titleBox,
    [panel, row, wholeWindow],
    display,
  );

  assert.equal(grewTo?.id, "ax-row-3");
});

test("a box that is already right is left alone", () => {
  const button = {
    id: "ax-button",
    role: "dom_button",
    label: "Save",
    x: 326,
    y: 294,
    width: 194,
    height: 32,
  };

  const { target, grewTo } = snapTargetToEnclosingControl(
    titleBox,
    [button],
    display,
  );

  assert.equal(grewTo, null, "growth under the ratio is not worth redrawing");
  assert.deepEqual(target, titleBox);
  assert.ok(targetEnclosurePolicy.minimumGrowthRatio > 1);
});

test("a target that overflows its container is not enclosed by it", () => {
  const narrow = {
    id: "ax-narrow",
    role: "dom_button",
    label: "Reviewed",
    x: 328,
    y: 296,
    width: 60,
    height: 28,
  };

  const { grewTo } = snapTargetToEnclosingControl(titleBox, [narrow], display);

  assert.equal(grewTo, null);
});

test("no candidates means the target passes through untouched", () => {
  assert.deepEqual(
    snapTargetToEnclosingControl(titleBox, undefined, display).target,
    titleBox,
  );
  assert.deepEqual(
    snapTargetToEnclosingControl(titleBox, [], display).target,
    titleBox,
  );
});
