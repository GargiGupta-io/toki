// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { GuidanceSuggestion } from "@toki/shared";

/**
 * Picking one of the offers, out loud.
 *
 * When Toki cannot find what was asked for it now offers what it can see
 * instead, and those offers have to be choosable. They are not buttons: the
 * overlay is a transparent window over somebody else's work and it deliberately
 * takes no clicks, which is the property that lets Toki sit on top of an
 * application without breaking it. Putting three buttons up there would trade
 * that away for a feature nobody asked to trade it for.
 *
 * So they are chosen the way everything else in Toki is -- by saying which one.
 * The microphone is already open at that moment, because a failure is exactly
 * when somebody is about to say something.
 *
 * Three ways of saying it are understood, because people use all three:
 *
 *   "the second one"        -- by position
 *   "appearance"            -- by name
 *   "no, none of those"     -- by declining
 *
 * Nothing here reaches a model. It runs on a list Toki is already holding and
 * has to answer instantly; a round trip to ask what somebody meant by "the
 * first one" would cost more than the suggestion saves.
 */

export type SuggestionChoice =
  | { kind: "chose"; index: number }
  | { kind: "declined" }
  | { kind: "unrelated" };

/**
 * Words that mean "none of these", said to a list.
 *
 * A refusal has to be recognised, because otherwise it is matched against the
 * labels as though it were a choice, and "no, that's not it" contains enough
 * ordinary words to hit something.
 */
const declineWords = [
  "none",
  "neither",
  "nope",
  "no thanks",
  "no thank you",
  "cancel",
  "never mind",
  "nevermind",
  "forget it",
  "stop",
];

/**
 * Ways of naming a position, minus the one that is a trap.
 *
 * "One" is missing from the first row deliberately. English puts it at the end
 * of every one of these phrases -- "the second one", "the third one" -- so
 * accepting it as a synonym for *first* meant every ordinal chose offer one.
 * A test caught it, and it would have been invisible in use: picking the third
 * option and being shown the first looks like the suggestions being wrong
 * rather than the words being misread.
 *
 * It is still understood when it is the whole reply. Answering a numbered list
 * with "one" is not ambiguous; it is only ambiguous inside a longer phrase.
 */
const ordinalWords: ReadonlyArray<readonly string[]> = [
  ["first", "1", "1st"],
  ["second", "two", "2", "2nd"],
  ["third", "three", "3", "3rd"],
];

/** Words that carry no position of their own, around one that does. */
const countingFiller = new Set(["the", "number", "option", "just", "please"]);

/**
 * Words too common to identify anything.
 *
 * Every label on a screen contains some of these, so matching on them makes
 * every phrase match every option -- and the first option then always wins,
 * which looks like Toki ignoring what was said.
 */
const fillerWords = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "that",
  "this",
  "it",
  "one",
  "option",
  "button",
  "click",
  "select",
  "choose",
  "pick",
  "open",
  "go",
  "please",
  "yeah",
  "yes",
  "ok",
  "okay",
  "show",
  "me",
  "my",
  "i",
  "want",
  "need",
  "let",
  "us",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function meaningfulWords(value: string): string[] {
  return normalise(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !fillerWords.has(word));
}

export const suggestionChoicePolicy = Object.freeze({
  /**
   * How much of an offer's name has to be said before it counts.
   *
   * A single shared word is not a choice -- "settings" appears in half the
   * labels on a settings screen. Requiring either most of a short name or two
   * distinct words means "appearance" picks Appearance and "the appearance
   * settings for dark mode" still does, while a passing mention does not.
   */
  minimumWordOverlap: 2,

  /** Or this share of the offer's own distinctive words, for short names. */
  minimumOverlapRatio: 0.6,
});

/**
 * What a spoken reply means, given what is on offer.
 *
 * Returns "unrelated" for anything that is not a choice, which is the common
 * case and must stay cheap: somebody who says a completely new request while
 * suggestions happen to be on screen is making a new request, and treating that
 * as a choice would point them at the wrong thing without their asking.
 */
export function matchSpokenChoice(
  transcript: string,
  suggestions: readonly GuidanceSuggestion[],
  policy = suggestionChoicePolicy,
): SuggestionChoice {
  const said = normalise(transcript);

  if (said.length === 0 || suggestions.length === 0) {
    return { kind: "unrelated" };
  }

  if (declineWords.some((word) => said === word || said.startsWith(`${word} `))) {
    return { kind: "declined" };
  }

  // By position, but only as the whole reply or close to it. "Second" alone is
  // a choice; "the second tab in the settings window" is a fresh request that
  // happens to begin with an ordinal.
  const words = said.split(" ");

  if (words.length <= 3) {
    const counting = words.filter((word) => !countingFiller.has(word));

    for (let index = 0; index < ordinalWords.length; index += 1) {
      if (index >= suggestions.length) {
        break;
      }

      if (ordinalWords[index].some((word) => counting.includes(word))) {
        return { kind: "chose", index };
      }
    }

    // "One" only as the whole reply, for the reason given above the table.
    if (counting.length === 1 && counting[0] === "one" && suggestions.length > 0) {
      return { kind: "chose", index: 0 };
    }
  }

  // By name. Scored across every offer and the best taken, rather than the
  // first that clears the bar -- two offers on one screen often share a word,
  // and the better match is the one that shares more.
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < suggestions.length; index += 1) {
    const label = suggestions[index]?.target?.label ?? "";
    const labelWords = meaningfulWords(label);

    if (labelWords.length === 0) {
      continue;
    }

    const spoken = new Set(meaningfulWords(transcript));
    const shared = labelWords.filter((word) => spoken.has(word));
    const ratio = shared.length / labelWords.length;

    const clears =
      shared.length >= policy.minimumWordOverlap ||
      ratio >= policy.minimumOverlapRatio;

    if (clears && shared.length > bestScore) {
      bestScore = shared.length;
      bestIndex = index;
    }
  }

  return bestIndex >= 0 ? { kind: "chose", index: bestIndex } : { kind: "unrelated" };
}

/**
 * The offers, written out for the notch.
 *
 * Numbered, because the numbers are half of how they get chosen, and a list
 * somebody is expected to answer has to show what the answers are.
 */
export function describeSuggestions(
  suggestions: readonly GuidanceSuggestion[],
): string {
  return suggestions
    .map((suggestion, index) => `${index + 1}. ${suggestion.target.label}`)
    .join("   ");
}
