import assert from "node:assert/strict";
import test from "node:test";

import {
  isTargetOnStaticText,
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

/*
 * The Xcode failure, with the real accessibility tree behind it.
 *
 * Every box below was read off the running application, not invented: Xcode
 * open on a project with two build errors, the Issue Navigator already showing.
 * Toki was asked to open that navigator and pointed at the text of one of the
 * errors -- which macOS publishes as `AXStaticText`, four rows below the
 * `AXRadioButton` that opens the navigator.
 *
 * Display was 1512x982.
 */

const xcodeDisplay = { width: 1512, height: 982 };

const issuesButton = {
  id: "ax-issues-4",
  role: "AXRadioButton AXSegment",
  source: "accessibility",
  label: "Issues",
  x: 354,
  y: 85,
  width: 28,
  height: 28,
};

const errorText = {
  id: "ax-no-account-16",
  role: "AXStaticText",
  source: "accessibility",
  label:
    'No Account for Team "9ZRLG6277G". Add a new account in Accounts settings or verify that your accounts have valid credentials.',
  x: 290,
  y: 145,
  width: 208,
  height: 50,
};

const navigatorPanel = {
  id: "ax-issue-navigator-12",
  role: "AXOutline",
  source: "accessibility",
  label: "Issue Navigator",
  x: 228,
  y: 120,
  width: 288,
  height: 731,
};

/** Where Toki actually drew its box: a fragment of the error message. */
const boxOnTheError = {
  candidateId: "vision-model-target",
  label: 'No Account for Team "9ZRLG6277G". Add a new account in Accounts...',
  x: 370,
  y: 150,
  width: 70,
  height: 40,
};

test("a box on an error message is recognised as text, not as a target", () => {
  assert.equal(
    isTargetOnStaticText(boxOnTheError, [navigatorPanel, errorText, issuesButton]),
    true,
  );
});

test("the control that was wanted is not mistaken for text", () => {
  // The Issues button sits inside the same panel. Refusing it too would turn a
  // wrong answer into no answers at all.
  const onTheButton = { ...issuesButton, candidateId: "vision-model-target" };

  assert.equal(
    isTargetOnStaticText(onTheButton, [navigatorPanel, errorText, issuesButton]),
    false,
  );
});

test("a caption inside a clickable row is a caption on a button", () => {
  // The ordinary case, and the one this must not break: almost every control
  // on screen has words inside it, and those words are published as text.
  const captionInsideRow = {
    id: "ax-caption",
    role: "AXStaticText",
    source: "accessibility",
    label: "Changes reviewed",
    x: 328,
    y: 296,
    width: 188,
    height: 28,
  };
  const clickableRow = {
    id: "ax-row",
    role: "AXRow",
    source: "accessibility",
    label: "Changes reviewed, 2 changes requested",
    x: 250,
    y: 272,
    width: 1108,
    height: 100,
  };

  assert.equal(
    isTargetOnStaticText(titleBox, [captionInsideRow, clickableRow]),
    false,
  );
});

test("without the accessibility tree nothing is called text", () => {
  // Recognised words are not authority. OCR reads a button's caption exactly as
  // readily as it reads a paragraph, so refusing on that evidence would refuse
  // real controls in every application whose tree Toki cannot read.
  const ocrText = {
    id: "ocr-9",
    role: "ocr_text",
    source: "ocr",
    label: "No Account for Team",
    x: 290,
    y: 145,
    width: 208,
    height: 50,
  };

  assert.equal(isTargetOnStaticText(boxOnTheError, [ocrText]), false);
  assert.equal(isTargetOnStaticText(boxOnTheError, []), false);
  assert.equal(isTargetOnStaticText(boxOnTheError, undefined), false);
});

test("a box grows to a real macOS control, which it never could before", () => {
  /*
   * The list of roles worth growing to held `accessibility_element` --
   * the name used only when an element publishes no role at all. Every real
   * macOS control publishes one, so this feature ran in browsers and did
   * nothing whatsoever in native applications.
   */
  const caption = {
    candidateId: "vision-model-target",
    label: "Manage Certificates",
    x: 1320,
    y: 700,
    width: 120,
    height: 18,
  };
  const button = {
    id: "ax-manage-certificates",
    role: "AXButton",
    source: "accessibility",
    label: "Manage Certificates…",
    x: 1300,
    y: 688,
    width: 184,
    height: 44,
  };

  const { grewTo, target } = snapTargetToEnclosingControl(
    caption,
    [button],
    xcodeDisplay,
  );

  assert.equal(grewTo?.id, "ax-manage-certificates");
  assert.equal(target.width, 184);
});

test("a window is still too big to be a control, whatever it calls itself", () => {
  const window = {
    id: "ax-window",
    role: "AXWindow AXStandardWindow",
    source: "accessibility",
    label: "TrackWeight — TrackWeight.xcodeproj",
    x: 221,
    y: 33,
    width: 1249,
    height: 869,
  };

  assert.equal(
    snapTargetToEnclosingControl(boxOnTheError, [window], xcodeDisplay).grewTo,
    null,
  );
});
