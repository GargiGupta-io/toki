// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { GuidanceSuggestion } from "@toki/shared";
import { withAlpha } from "./TokiGuidanceSpotlight";
import { placeGuidanceAnchor } from "./guidanceAnchorPlacement";
import {
  estimateSuggestionListHeight,
  suggestionListPolicy,
} from "./suggestionListLayout";
import type { ViewportMetrics } from "./overlayGeometry";
import "./TokiSuggestionList.css";

/**
 * The offers, where they can be read.
 *
 * They were put in the notch, which is one line of text that truncates -- so
 * three suggestions arrived as "1. Comment options menu button -- say which
 * one, or s…" and the second and third were never seen at all. A list nobody
 * can read is not a list; it is a longer error message.
 *
 * They are drawn on the screen instead, beside the blob, the same way a found
 * target is drawn beside the blob. That is the pattern this app already has
 * for "look here", and reusing it means the answer to "I couldn't find that"
 * appears in the same place as the answer to "here it is".
 *
 * Numbered, because the numbers are half of how they get chosen -- saying "the
 * second one" only works if the second one is visibly the second one.
 *
 * Takes no pointer events, like everything else Toki draws. The overlay covers
 * somebody's whole screen and the entire product rests on it not intercepting
 * anything; these are chosen by speaking, not by clicking.
 */

export function TokiSuggestionList({
  suggestions,
  blob,
  viewport,
  colour,
  heard,
}: {
  suggestions: readonly GuidanceSuggestion[];
  /** Where the blob currently is, so the list can sit next to it. */
  blob: { x: number; y: number; width: number; height: number } | null;
  viewport: ViewportMetrics;
  colour: string;
  /** What Toki heard, so the person can see whether that was the problem. */
  heard: string | null;
}) {
  if (suggestions.length === 0 || blob == null) {
    return null;
  }

  const { widthPx, paddingPx } = suggestionListPolicy;
  const height = estimateSuggestionListHeight(suggestions.length);

  // The same placement the blob itself uses against a target: outside, on the
  // side with room, clamped to the screen. One rule, one behaviour, and the
  // list cannot end up half off the edge of the display.
  const placed = placeGuidanceAnchor(
    blob,
    { width: widthPx, height },
    viewport,
  );

  return (
    <div
      className="toki-suggestions"
      style={{
        left: `${placed.x}px`,
        top: `${placed.y}px`,
        width: `${widthPx}px`,
        padding: `${paddingPx}px`,
        borderColor: withAlpha(colour, 0.5),
      }}
      aria-hidden="true"
    >
      <p className="toki-suggestions__header">
        {heard ? (
          <>
            I couldn't find <span className="toki-suggestions__heard">{heard}</span>
          </>
        ) : (
          "I couldn't find that"
        )}
      </p>

      <ol className="toki-suggestions__list">
        {suggestions.map((suggestion, index) => (
          <li className="toki-suggestions__item" key={suggestion.target.label}>
            <span
              className="toki-suggestions__number"
              style={{
                background: withAlpha(colour, 0.22),
                borderColor: withAlpha(colour, 0.55),
                color: colour,
              }}
            >
              {index + 1}
            </span>
            <span className="toki-suggestions__text">
              <span className="toki-suggestions__label">
                {suggestion.target.label}
              </span>
              {suggestion.reason ? (
                <span className="toki-suggestions__reason">
                  {suggestion.reason}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {/* How to answer. A list somebody is expected to reply to has to say so,
          and holding the key again is the way out when the problem was that
          Toki misheard in the first place. */}
      <p className="toki-suggestions__hint">
        Say the number, or hold Option and ask again.
      </p>
    </div>
  );
}
