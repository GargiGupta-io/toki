// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFirstRun,
  chooseColour,
  findColour,
  firstRunColours,
  isFirstRunVisible,
  readFirstRun,
  writeFirstRun,
  type FirstRunState,
} from "./firstRun";
import { emitTo } from "@tauri-apps/api/event";
import "./TokiFirstRun.css";

/**
 * Meeting Toki, in the notch.
 *
 * Three screens -- sign in, choose its colour, be introduced to it -- and then
 * the permissions, in the same panel. Not a window: Toki lives under the notch,
 * and an introduction that opens a window somewhere else is introducing
 * something that then moves.
 *
 * The creature appears on the last screen already wearing the colour chosen on
 * the one before. That is the moment this stops being an installer.
 */

export function TokiFirstRun({
  displayName,
  onSignIn,
  signedIn,
  onFinished,
}: {
  /** From the account, once there is one. Null until then. */
  displayName: string | null;
  onSignIn: () => Promise<void> | void;
  signedIn: boolean;
  onFinished: (state: FirstRunState) => void;
}) {
  const [state, setState] = useState<FirstRunState>(() => readFirstRun());
  const [busy, setBusy] = useState(false);
  const announced = useRef(false);

  /*
   * Whether an account already existed when this opened.
   *
   * The difference between "you have just signed in" and "you were already
   * signed in", which look identical one render later and mean opposite things.
   */
  const wasSignedInAtStart = useRef(signedIn);

  /*
   * Signing in finishes in the browser, long after the click.
   *
   * A sign-in that lands *now* moves on, because it is the answer to the
   * question this screen just asked -- leaving somebody looking at the same
   * screen with the button relabelled is the app failing to acknowledge the
   * thing it sent them away to do.
   *
   * A session that was already signed in when this opened does not, which is
   * the case that made this wait in the first place: a replay would otherwise
   * skip its own opening line and start the introduction in the middle.
   */
  useEffect(() => {
    if (!signedIn) {
      return;
    }

    setState((current) => {
      if (current.signedIn) {
        return current;
      }

      const known = { ...current, signedIn: true };

      return wasSignedInAtStart.current || known.step !== "welcome"
        ? known
        : advanceFirstRun(known);
    });
  }, [signedIn]);

  useEffect(() => {
    writeFirstRun(state);

    if (!isFirstRunVisible(state) && !announced.current) {
      announced.current = true;
      onFinished(state);
    }
  }, [state, onFinished]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      setBusy(false);
    }
  }, [onSignIn]);

  if (!isFirstRunVisible(state)) {
    return null;
  }

  const colour = findColour(state.colour);

  return (
    <section className="toki-first-run" aria-label="Welcome to Toki">
        {state.step === "welcome" ? (
          <>
            <TokiMark colour={colour.hex} />
            <h1>Welcome to Toki.</h1>
            <p>A tiny AI buddy that lives on your Mac.</p>
            <button
              type="button"
              className="toki-first-run__primary"
              onClick={() =>
                // Already signed in -- a replay, or somebody coming back --
                // so there is nothing to ask for and this just moves on.
                state.signedIn ? setState(advanceFirstRun) : void signIn()
              }
              disabled={busy}
            >
              {state.signedIn
                ? "Continue"
                : busy
                  ? "Waiting for your browser…"
                  : "Sign in with Google"}
            </button>
          </>
        ) : null}


        {state.step === "colour" ? (
          <>
            <h1>Pick a color</h1>
            <p>Click one to bring me to life. Choose wisely.</p>
            <div className="toki-first-run__colours">
              {firstRunColours.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="toki-first-run__colour"
                  style={{ background: option.hex }}
                  aria-label={option.label}
                  aria-pressed={option.id === state.colour}
                  data-selected={option.id === state.colour}
                  onClick={() => {
                    setState((current) => chooseColour(current, option.id));

                    /*
                     * The live creature, not only the mark on this card.
                     *
                     * "Click one to bring me to life" is a promise about the
                     * thing that lives in the notch, and picking a colour that
                     * only recoloured a picture on the card was the app not
                     * keeping it. The overlay is a separate window, so it is
                     * told rather than re-rendered.
                     */
                    void emitTo("overlay", "toki://creature-colour", {
                      colour: option.id,
                    }).catch(() => undefined);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="toki-first-run__primary"
              onClick={() => setState(advanceFirstRun)}
            >
              That one
            </button>
          </>
        ) : null}

        {state.step === "greeting" ? (
          <>
            {/* The first time the creature appears, already in the colour that
                was just chosen. This is the moment it stops being an installer. */}
            <TokiMark colour={colour.hex} glow />
            <h1>Hi{displayName ? `, ${displayName}` : ""}.</h1>
            <p>I&rsquo;m Toki.</p>
            <button
              type="button"
              className="toki-first-run__primary"
              onClick={() => setState(advanceFirstRun)}
            >
              Give me a home
            </button>
          </>
        ) : null}
    </section>
  );
}

/**
 * The creature, standing still.
 *
 * Not the live blob: that one follows a pointer and springs, and dropping it
 * into a card would have it chasing the cursor around a window it is supposed
 * to be sitting in. This is the same shape at rest, in the chosen colour.
 */
function TokiMark({ colour, glow = false }: { colour: string; glow?: boolean }) {
  return (
    <span
      className="toki-first-run__mark"
      data-glow={glow}
      style={{ "--mark-colour": colour } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

export { isFirstRunVisible };
