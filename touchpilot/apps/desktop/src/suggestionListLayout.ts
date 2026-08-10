// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * How much room the offers need, and how to decide it.
 *
 * Kept apart from the component that draws them for one reason: the component
 * imports a stylesheet, and a stylesheet cannot be loaded by the test runner.
 * Sizing is arithmetic and deserves to be checked; putting it behind a CSS
 * import would mean the only way to verify it is to look at the screen.
 *
 * The same split already exists for the selection trail, for the same reason
 * and after the same problem.
 */

export const suggestionListPolicy = Object.freeze({
  /**
   * Wide enough for a control name and a few words about it, narrow enough to
   * sit beside the blob without becoming the screen.
   */
  widthPx: 330,

  /** Roughly what one entry occupies, for deciding where the list fits. */
  entryHeightPx: 52,

  /** The "I couldn't find that" line above them. */
  headerHeightPx: 34,

  /** And the line underneath saying how to answer. */
  hintHeightPx: 32,

  paddingPx: 14,
});

/**
 * What the panel will occupy, before it is drawn.
 *
 * An estimate, and it only has to be close: it decides which side of the blob
 * the list goes on, and being a few pixels out moves nothing. Being badly
 * wrong would put a three-entry list half off the bottom of the screen, which
 * is why it counts the entries rather than assuming a fixed height.
 */
export function estimateSuggestionListHeight(count: number): number {
  const { entryHeightPx, headerHeightPx, hintHeightPx, paddingPx } =
    suggestionListPolicy;

  return (
    headerHeightPx +
    Math.max(0, count) * entryHeightPx +
    hintHeightPx +
    paddingPx * 2
  );
}
