// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Telling a button from a paragraph.
 *
 * macOS says which is which, on every element, for free. Toki asked for it,
 * carried it all the way through, and then never read it.
 *
 * The type declaring what a candidate's role can be lists nine values --
 * `accessibility_element`, `ocr_text`, `dom_button` and so on -- and native
 * macOS controls do not arrive as any of them. They arrive as what the
 * accessibility tree actually calls them: `AXButton`, `AXRadioButton AXSegment`,
 * `AXStaticText`, `AXTextField AXSearchField`. Nothing checked, because the
 * value crosses from Rust as untyped data and TypeScript believes the
 * declaration rather than the wire.
 *
 * The cost was not theoretical. Asked to open Xcode's Issue Navigator, Toki
 * drew its box around three lines of an error message -- an element the
 * operating system had already labelled `AXStaticText`, sitting four rows below
 * the `AXRadioButton` that actually opens it. Growing a box to the control
 * containing it never ran either, because no real macOS role was on the list of
 * roles worth growing to. Both features were dead on every native application
 * and alive only in browsers, which publish `dom_*` roles.
 *
 * Kept as its own module because three separate things need the answer: whether
 * to grow a box, whether to refuse one, and what to tell the model about each
 * piece of evidence it is given.
 */

export type RoleKind =
  /** A thing that does something when clicked, typed in, or dragged. */
  | "interactive"
  /** Words on screen. Reading them is the point; clicking them is not. */
  | "text"
  /** Something holding other things: a window, a group, a scroll area. */
  | "container"
  /** No role published, or one nothing here recognises. */
  | "unknown";

/*
 * Written as the accessibility tree spells them, lower-cased for comparison.
 *
 * A candidate's role is the element's role and its subrole joined -- "AXButton
 * AXSegment", "AXWindow AXStandardWindow" -- so these are matched per word and
 * the most specific answer wins. A segment of a segmented control is a button
 * whatever its parent is called.
 */
const interactiveRoles = new Set([
  // macOS
  "axbutton",
  "axradiobutton",
  "axcheckbox",
  "axswitch",
  "axmenubutton",
  "axpopupbutton",
  "axmenuitem",
  "axmenubaritem",
  "axtextfield",
  "axtextarea",
  "axsearchfield",
  "axcombobox",
  "axslider",
  "axincrementor",
  "axstepper",
  "axdisclosuretriangle",
  "axlink",
  "axcolorwell",
  "axsegment",
  "axtoolbarbutton",
  "axclosebutton",
  "axminimizebutton",
  "axzoombutton",
  "axfullscreenbutton",
  "axsortbutton",
  // A row or a cell is how a list publishes "this whole line is one thing you
  // click", which is exactly the case a box is supposed to grow to.
  "axrow",
  "axcell",
  // The web, and anything Toki was told about by hand.
  "dom_button",
  "dom_link",
  "dom_input",
  "dom_select",
  "dom_textarea",
  "dom_candidate",
  "manual",
  /*
   * An accessibility element that published bounds and a label but no role.
   *
   * Kept as interactive because that is what it has always meant here and
   * because the case it was introduced for -- a row published as one element
   * with no role of its own -- is real. The reason it was previously dangerous
   * was that everything looked like this; now that static text is recognised
   * as static text, what is left is genuinely ambiguous rather than unread.
   */
  "accessibility_element",
]);

const textRoles = new Set([
  "axstatictext",
  "axheading",
  "axtextindicator",
  "ocr_text",
]);

const containerRoles = new Set([
  "axwindow",
  "axapplication",
  "axgroup",
  "axsplitgroup",
  "axscrollarea",
  "axlist",
  "axtable",
  "axoutline",
  "axtoolbar",
  "axtabgroup",
  "axlayoutarea",
  "axsheet",
  "axdrawer",
  "axmenubar",
  "axmenu",
  "axunknown",
  "axsplitter",
  "axscrollbar",
  "aximage",
]);

/**
 * What kind of thing this role describes.
 *
 * Interactive beats text beats container, so a control whose subrole happens to
 * name its surroundings is still a control.
 */
export function classifyCandidateRole(role: string | null | undefined): RoleKind {
  if (typeof role !== "string") {
    return "unknown";
  }

  const words = role
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "unknown";
  }

  if (words.some((word) => interactiveRoles.has(word))) {
    return "interactive";
  }

  if (words.some((word) => textRoles.has(word))) {
    return "text";
  }

  if (words.some((word) => containerRoles.has(word))) {
    return "container";
  }

  return "unknown";
}

/** Something a click, a keystroke or a drag does something to. */
export function isInteractiveRole(role: string | null | undefined): boolean {
  return classifyCandidateRole(role) === "interactive";
}

/**
 * Words rather than a control.
 *
 * Only ever asserted from the accessibility tree or from recognised text, both
 * of which are describing what is really there. A guess is never text: it is
 * unknown, and unknown is not grounds for refusing anything.
 */
export function isTextRole(role: string | null | undefined): boolean {
  return classifyCandidateRole(role) === "text";
}
