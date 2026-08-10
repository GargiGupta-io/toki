// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { ScreenCandidate, TargetBox } from "@toki/shared";

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

/**
 * Roles that are a thing you click.
 *
 * Recognised text and the model's own invented box are deliberately absent:
 * neither is evidence that anything at those coordinates is interactive.
 */
const clickableRoles: ReadonlySet<ScreenCandidate["role"]> = new Set([
  "accessibility_element",
  "dom_button",
  "dom_link",
  "dom_input",
  "dom_select",
  "dom_textarea",
  "dom_candidate",
]);

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
    if (!clickableRoles.has(candidate.role)) {
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
