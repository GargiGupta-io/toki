// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { ScreenCandidate, TargetBox } from "@toki/shared";
import { isInteractiveRole, isTextRole } from "./uiRoleInteractivity";

/**
 * Drawing the box around the thing you actually click.
 *
 * A model asked to point at a control returns a box around the *words* it
 * recognised. On a row like "Changes reviewed — 2 changes requested by
 * reviewers", where the whole row is one button with a chevron at the far end,
 * that box lands on the title and nothing else. The instruction then reads
 * "click Changes reviewed" beside a mark on two words in the middle of a
 * clickable strip a thousand pixels wide -- which is not wrong, exactly, but it
 * describes a fragment of the target and leaves somebody guessing whether the
 * rest of the row counts.
 *
 * The accessibility tree already knows the answer. A row that behaves as one
 * button is published as one element with its full bounds, and those elements
 * are collected as candidates on every request. So when the model's box sits
 * inside a candidate that is genuinely clickable, the candidate's bounds are
 * the honest ones and the box grows to them.
 *
 * Two guards, both learned from what goes wrong without them:
 *
 * **Only controls.** Recognised text is not a control, so an OCR box never
 * swallows a target -- otherwise a paragraph containing the word "Save" becomes
 * the thing to click.
 *
 * **Only reasonable sizes.** Windows, scroll areas and page bodies are
 * accessibility elements too, and every one of them contains every control on
 * screen. A box around the entire window points at nothing while appearing to
 * point at something, which is worse than the tight box it replaced.
 *
 * Where several candidates qualify, the smallest wins. That is the innermost
 * clickable thing containing the target, which is the thing a click actually
 * lands on.
 */

export const targetEnclosurePolicy = Object.freeze({
  /**
   * How far outside the candidate the model's box may stray.
   *
   * The two come from different measurements -- one from a screenshot scaled
   * and mapped back to display pixels, the other read from the accessibility
   * tree -- so demanding exact containment fails on rounding alone.
   */
  containmentSlackPx: 6,

  /**
   * The largest share of the display an enclosing control may occupy.
   *
   * Past this it is a region rather than a control. A third of the screen is
   * already a very large button; a window or a page body is far past it.
   */
  maximumAreaFraction: 0.3,

  /**
   * And no taller than this share of the display.
   *
   * Area alone lets a full-height sidebar through -- narrow enough to pass on
   * area, tall enough that a box around it says nothing about where to click.
   */
  maximumHeightFraction: 0.45,

  /**
   * Below this the growth is not worth having.
   *
   * If the enclosing control is barely larger than the box already drawn, the
   * box is already right, and redrawing it a few pixels bigger only moves
   * things about on screen for no gain.
   */
  minimumGrowthRatio: 1.35,
});

function area(box: { width: number; height: number }): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function contains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  slack: number,
): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

export type EnclosureResult = {
  target: TargetBox;
  /** The candidate the box grew to, if it grew. Null when it was left alone. */
  grewTo: ScreenCandidate | null;
};

/**
 * Grow a target to the clickable element containing it, when there is one.
 *
 * Returns the original target unchanged whenever no candidate qualifies, so a
 * caller can use the result unconditionally.
 */
export function snapTargetToEnclosingControl(
  target: TargetBox,
  candidates: readonly ScreenCandidate[] | undefined,
  display: { width: number; height: number },
  policy = targetEnclosurePolicy,
): EnclosureResult {
  if (
    candidates == null ||
    candidates.length === 0 ||
    target.width <= 0 ||
    target.height <= 0 ||
    display.width <= 0 ||
    display.height <= 0
  ) {
    return { target, grewTo: null };
  }

  const displayArea = display.width * display.height;
  const targetArea = area(target);
  let best: ScreenCandidate | null = null;

  for (const candidate of candidates) {
    if (!isInteractiveRole(candidate.role)) {
      continue;
    }

    if (candidate.width <= 0 || candidate.height <= 0) {
      continue;
    }

    if (!contains(candidate, target, policy.containmentSlackPx)) {
      continue;
    }

    const candidateArea = area(candidate);

    if (candidateArea > displayArea * policy.maximumAreaFraction) {
      continue;
    }

    if (candidate.height > display.height * policy.maximumHeightFraction) {
      continue;
    }

    if (targetArea > 0 && candidateArea < targetArea * policy.minimumGrowthRatio) {
      continue;
    }

    if (best == null || candidateArea < area(best)) {
      best = candidate;
    }
  }

  if (best == null) {
    return { target, grewTo: null };
  }

  return {
    target: {
      // The label and the candidate id stay as they were resolved. What is
      // being corrected here is the geometry, not the identity of the thing --
      // and the label is what the notch reads out, so replacing it with the
      // container's accessibility name would change the instruction.
      ...target,
      x: best.x,
      y: best.y,
      width: best.width,
      height: best.height,
    },
    grewTo: best,
  };
}

/**
 * Whether the box landed on words rather than on a control.
 *
 * Asked to open Xcode's Issue Navigator, Toki boxed three lines of a build
 * error and said, confidently, to click them. The operating system had already
 * published that element as static text, and the control that actually opens
 * the navigator was four rows above it -- also published, also collected, also
 * ignored.
 *
 * Pointing at text is a particular kind of wrong. Somebody follows the
 * instruction, clicks, nothing happens, and there is nothing to learn from
 * that: the target looked exactly like a correct one. Saying "I can't see it"
 * is worse in appearance and better in every other way, because it comes with
 * the alternatives -- and the control that was wanted is usually among them.
 *
 * Three conditions, all required:
 *
 * **The tree was actually read.** Without accessibility evidence there is no
 * authority for calling anything text, and recognised words are not authority:
 * a button's caption is text too.
 *
 * **Something says these coordinates are text.** Not "near text" -- the box
 * sits inside an element the tree calls static text.
 *
 * **And nothing says they are a control.** A caption inside a clickable row is
 * a caption on a button, which is the ordinary case and must survive. Checked
 * without the size limits used for growing a box, because the question here is
 * only whether a control is there at all.
 */
export function isTargetOnStaticText(
  target: TargetBox,
  candidates: readonly ScreenCandidate[] | undefined,
  policy = targetEnclosurePolicy,
): boolean {
  if (candidates == null || candidates.length === 0) {
    return false;
  }

  const hasAccessibilityEvidence = candidates.some(
    (candidate) => candidate.source === "accessibility",
  );

  if (!hasAccessibilityEvidence) {
    return false;
  }

  const slack = policy.containmentSlackPx;
  let onText = false;

  for (const candidate of candidates) {
    if (candidate.width <= 0 || candidate.height <= 0) {
      continue;
    }

    if (!contains(candidate, target, slack)) {
      continue;
    }

    if (isInteractiveRole(candidate.role)) {
      return false;
    }

    if (isTextRole(candidate.role) && candidate.source === "accessibility") {
      onText = true;
    }
  }

  return onText;
}
