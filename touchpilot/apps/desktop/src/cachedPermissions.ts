// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The permissions macOS answers once and never revises.
 *
 * Screen recording and input monitoring both go through the `CGPreflight...`
 * family, and accessibility behaves the same way in practice. All three are
 * hard to get for two reasons that compound.
 *
 * **It answers once per process.** macOS tells an application whether it may
 * record when it first asks, and never revises that answer while the process
 * lives. Toki asks at launch, is told no, and is stuck. Switch Toki on in
 * System Settings and the running Toki still cannot see it: it re-checks, is
 * handed the same stale no, and asks again. The visible result is the switch
 * plainly on in the list while the panel keeps asking, still counting one of
 * five. It reads as the app being broken, and it is not wrong to think so.
 *
 * **It prompts once, ever.** After a refusal `CGRequestScreenCaptureAccess`
 * returns false without showing anything. The button is then dead: pressing
 * Allow does nothing at all, forever, with no hint that Settings is the only
 * way through.
 *
 * The old flow sent people to the Settings list up front, which caused the
 * third problem: flipping a switch there for a running app makes macOS put up
 * *"Toki may not be able to record until it is quit"*. HeyClicky never showed
 * that alert because it never sent anybody to the list -- it raised the system
 * prompt in place, and you pressed Allow on that.
 *
 * So: prompt first, always. Settings only once the prompt is spent. And when
 * the grant lands somewhere this process cannot see, restart rather than
 * pretend. Toki has no Dock icon and no window during any of this, so
 * restarting costs a blink.
 */

/** What a freshly started process would be told. */
export type LivePermissionState =
  /** This process can record. */
  | "granted"
  /** The permission is held; this process was refused at launch and is stuck. */
  | "pending_restart"
  /** Genuinely not granted. */
  | "denied";

export type CachedPermissionAction =
  /** Nothing to do. Move to the next step. */
  | "continue"
  /** Raise Apple's own dialog. */
  | "prompt"
  /** The prompt is spent; open the Settings pane instead. */
  | "settings"
  /** Granted, but not to this process. Restart and carry on. */
  | "restart";

export type CachedPermissionSituation = {
  live: LivePermissionState;
  /**
   * Whether the system prompt has already been raised in this run.
   *
   * Not whether it was *answered*. macOS shows it once per install, so a
   * dismissed prompt is a spent prompt, and offering it again is offering a
   * button that does nothing.
   */
  promptSpent: boolean;
};

export function decideCachedPermissionAction(
  situation: CachedPermissionSituation,
): CachedPermissionAction {
  if (situation.live === "granted") {
    return "continue";
  }

  if (situation.live === "pending_restart") {
    return "restart";
  }

  return situation.promptSpent ? "settings" : "prompt";
}

/**
 * What to say, given what is about to happen.
 *
 * Each line names the next physical act, because at this point in a first run
 * somebody is looking at two windows at once -- Toki's panel and whatever macOS
 * has just put on screen -- and needs to know which one to touch.
 */
export function describeCachedPermissionAction(
  action: CachedPermissionAction,
  ask: { need: string; todo: string },
): {
  need: string;
  todo: string;
  button: string;
} {
  switch (action) {
    case "restart":
      return {
        need: "Got it. One moment.",
        // Named as Toki's doing, not as a chore handed over. The old wording
        // asked the person to quit and reopen the app themselves, which is a
        // strange thing to ask of something that has no window.
        todo: "Starting again so I can actually see.",
        button: "",
      };
    case "settings":
      return {
        need: ask.need,
        // macOS will not show its dialog twice, and saying so is the
        // difference between "this button is broken" and "of course".
        todo: "macOS only asks once — switch me on in the list.",
        button: "Open",
      };
    case "continue":
      return {
        need: ask.need,
        todo: "That is everything I need.",
        button: "Next",
      };
    default:
      return { need: ask.need, todo: ask.todo, button: "Allow" };
  }
}

/**
 * How long to leave "One moment" on screen before restarting.
 *
 * Long enough to be read, short enough that nobody wonders. Without it the
 * window vanishes on the same frame the grant lands, which reads as a crash --
 * and a crash at the exact moment somebody granted a sensitive permission is
 * the worst possible thing to look like.
 */
export const restartNoticeMs = 900;

/**
 * The permissions this applies to.
 *
 * The camera and the microphone are not here: those report honestly on every
 * read, because they go through a different system entirely. Asking them this
 * way would start a process for no reason.
 *
 * Screen recording was fixed alone first, which was too narrow -- the very next
 * step in the flow has identical behaviour and was left with an identically
 * dead button, eight seconds of it, polling an answer that could never change.
 */
export const processCachedPermissions = Object.freeze([
  "screen_recording",
  "accessibility",
  "input_monitoring",
] as const);

export function isProcessCachedPermission(kind: string): boolean {
  return (processCachedPermissions as readonly string[]).includes(kind);
}

/**
 * Compare what this process believes with what a new one would be told.
 *
 * The disagreement is the whole signal: the permission is held, and only a
 * restart will let this process use it.
 */
export function livePermissionState(
  inProcess: string,
  live: string | undefined,
): LivePermissionState {
  if (inProcess === "granted") {
    return "granted";
  }

  if (live === "granted") {
    return "pending_restart";
  }

  return "denied";
}
