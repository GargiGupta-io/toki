// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The first five minutes.
 *
 * Sign in, say where you heard about Toki, choose its colour, meet it, and then
 * hand over to the permissions in the notch. Four screens in a window and one
 * handoff, in that order.
 *
 * The order is the argument. Nothing is asked for until there is something to
 * lose by walking away: the account comes first because everything else is
 * pointless without it, the colour before the greeting because the greeting is
 * the first time the creature appears and it should already be yours, and the
 * permissions last -- in the notch, where Toki actually lives -- because that
 * is the only step where macOS puts its own dialog on screen and the app should
 * get out of its way.
 */

export type FirstRunStep =
  | "welcome"
  | "colour"
  | "greeting"
  /** Not a screen. The window closes and the notch takes over. */
  | "handoff"
  | "done";


/**
 * The colours Toki can be.
 *
 * Four, not a picker. A wheel makes somebody stop and design something; four
 * makes them point at the one they like and move on, which is the whole
 * intention of asking at the start rather than burying it in settings.
 *
 * Blue is first and is the default, so anybody who skips this ends up with the
 * creature exactly as it already looks.
 */
export const firstRunColours = Object.freeze([
  { id: "blue", label: "Blue", hex: "#2A9BFF" },
  { id: "green", label: "Green", hex: "#30D158" },
  { id: "amber", label: "Amber", hex: "#FFB63F" },
  { id: "rose", label: "Rose", hex: "#FF5470" },
] as const);

export type FirstRunColourId = (typeof firstRunColours)[number]["id"];

export const defaultColourId: FirstRunColourId = "blue";

export type FirstRunState = {
  step: FirstRunStep;
  signedIn: boolean;
  colour: FirstRunColourId;
};

export const initialFirstRun: FirstRunState = Object.freeze({
  step: "welcome",
  signedIn: false,
  colour: defaultColourId,
});

/**
 * The next screen, given what has happened.
 *
 * A function of the state rather than a counter, so a session that resumes --
 * signed in already, colour already chosen -- lands where it should instead of
 * replaying screens somebody has answered.
 */
export function nextFirstRunStep(state: FirstRunState): FirstRunStep {
  switch (state.step) {
    case "welcome":
      /*
       * Always shown, and never skipped for somebody who is already signed in.
       *
       * It used to advance itself the moment an account existed, which meant a
       * replay -- or anybody returning -- opened on the second screen. The
       * introduction begins by saying what Toki is; jumping past that because
       * the account happens to exist starts a conversation in the middle.
       */
      return state.signedIn ? "colour" : "welcome";
    case "colour":
      return "greeting";
    case "greeting":
      return "handoff";
    default:
      return "done";
  }
}

export function advanceFirstRun(state: FirstRunState): FirstRunState {
  return { ...state, step: nextFirstRunStep(state) };
}


export function chooseColour(
  state: FirstRunState,
  colour: FirstRunColourId,
): FirstRunState {
  // Not advanced here. The creature changes colour under the dots so the choice
  // can be seen and changed before it is taken.
  return { ...state, colour };
}

export function findColour(id: FirstRunColourId) {
  return firstRunColours.find((colour) => colour.id === id) ?? firstRunColours[0];
}

/** Whether the window should be on screen at all. */
export function isFirstRunVisible(state: FirstRunState): boolean {
  return state.step !== "handoff" && state.step !== "done";
}

const STORAGE_KEY = "toki.firstRun";

/**
 * What is remembered, and what is not.
 *
 * The colour and the answer, because they are decisions. Not the step: a first
 * run interrupted half way through should start again rather than resume into
 * the middle of a sentence, and the steps it replays are three clicks.
 */
export function readFirstRun(
  storage: Pick<Storage, "getItem"> | null = globalThis.localStorage ?? null,
): FirstRunState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);

    if (raw == null) {
      return initialFirstRun;
    }

    const saved = JSON.parse(raw) as Partial<FirstRunState> & { completed?: boolean };
    const colour = firstRunColours.some((entry) => entry.id === saved.colour)
      ? (saved.colour as FirstRunColourId)
      : defaultColourId;

    return {
      ...initialFirstRun,
      colour,
      step: saved.completed ? "done" : "welcome",
    };
  } catch {
    return initialFirstRun;
  }
}

export function writeFirstRun(
  state: FirstRunState,
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage ?? null,
): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colour: state.colour,
        completed: state.step === "handoff" || state.step === "done",
      }),
    );
  } catch {
    // Storage refused. The first run works for this launch and asks again next
    // time, which is a better failure than refusing to start.
  }
}

/**
 * Forget that the introduction ever happened.
 *
 * A first run that can only happen once cannot be checked without wiping the
 * install, which means the flow most likely to be broken is the one nobody
 * looks at again. Keeping it replayable is also how the app gets demonstrated
 * without handing somebody your laptop.
 */
export function resetFirstRun(
  storage: Pick<Storage, "removeItem"> | null = globalThis.localStorage ?? null,
): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do. The introduction simply does not replay.
  }
}
