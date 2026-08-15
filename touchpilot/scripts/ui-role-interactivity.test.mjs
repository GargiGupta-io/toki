import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCandidateRole,
  isInteractiveRole,
  isTextRole,
} from "../apps/desktop/src/uiRoleInteractivity.ts";

/**
 * The roles in these tests were read off a real screen, not invented.
 *
 * Xcode was open with two build errors showing. Toki was asked to open the
 * Issue Navigator and drew its box around three lines of one of those errors --
 * an element macOS publishes as `AXStaticText` -- while the control that opens
 * the navigator sat four rows above it as `AXRadioButton AXSegment "Issues"`.
 *
 * Both were in the evidence. Nothing in Toki could tell them apart, because the
 * only list of "roles you can click" held the nine names the TypeScript type
 * claims a role can have, and a native macOS control is never any of them.
 */

const fromXcode = [
  { role: "AXWindow AXStandardWindow", kind: "container" },
  { role: "AXSplitGroup", kind: "container" },
  { role: "AXGroup", kind: "container" },
  { role: "AXRadioButton AXSegment", kind: "interactive" },
  { role: "AXOutline", kind: "container" },
  { role: "AXStaticText", kind: "text" },
  { role: "AXDisclosureTriangle", kind: "interactive" },
  { role: "AXTextField AXSearchField", kind: "interactive" },
  { role: "AXCheckBox", kind: "interactive" },
  { role: "AXButton", kind: "interactive" },
  { role: "AXMenuButton", kind: "interactive" },
  { role: "AXPopUpButton", kind: "interactive" },
  { role: "AXScrollArea", kind: "container" },
  { role: "AXButton AXSegment", kind: "interactive" },
  { role: "AXButton AXFullScreenButton", kind: "interactive" },
  { role: "AXMenuBarItem", kind: "interactive" },
];

test("every role a real macOS window publishes is classified", () => {
  for (const { role, kind } of fromXcode) {
    assert.equal(classifyCandidateRole(role), kind, role);
  }
});

test("the two that were confused are told apart", () => {
  // The whole bug, in one assertion: the button that opens the navigator, and
  // the error message Toki pointed at instead.
  assert.ok(isInteractiveRole("AXRadioButton AXSegment"));
  assert.ok(isTextRole("AXStaticText"));
  assert.ok(!isInteractiveRole("AXStaticText"));
});

test("a subrole naming the surroundings does not demote the control", () => {
  // "AXButton AXSegment" is a button inside a segmented control, and
  // "AXTextField AXSearchField" is a field. Reading only the first word, or
  // only the last, gets one of these wrong.
  assert.ok(isInteractiveRole("AXButton AXSegment"));
  assert.ok(isInteractiveRole("AXTextField AXSearchField"));
  assert.ok(!isInteractiveRole("AXWindow AXStandardWindow"));
});

test("the web roles keep working", () => {
  // These were the only ones that ever worked, and the fix must not trade one
  // platform for the other.
  for (const role of [
    "dom_button",
    "dom_link",
    "dom_input",
    "dom_select",
    "dom_textarea",
    "dom_candidate",
  ]) {
    assert.ok(isInteractiveRole(role), role);
  }
});

test("recognised words are text, and a guess is neither", () => {
  // OCR reads a button's caption as readily as a paragraph, so it can say
  // something is text but never that it is not a control. A vision guess
  // carries no authority at all.
  assert.equal(classifyCandidateRole("ocr_text"), "text");
  assert.equal(classifyCandidateRole("vision_control"), "unknown");
  assert.equal(classifyCandidateRole(undefined), "unknown");
  assert.equal(classifyCandidateRole(""), "unknown");
});

test("an unrecognised role is unknown rather than assumed", () => {
  // Toki runs on somebody else's applications. A role nobody here has seen is
  // not grounds for refusing to point at something, nor for growing a box to
  // it -- it is simply not evidence either way.
  assert.equal(classifyCandidateRole("AXSomethingNobodyHasSeen"), "unknown");
});
