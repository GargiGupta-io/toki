// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Asking for everything once, at the start, and never again.
 *
 * Toki needs five permissions and used to collect them the worst possible way:
 * whenever a feature happened to reach for one. Somebody would say a command,
 * wait, and be told screen recording was not trusted -- in red, mid-task, after
 * the thing they asked for had already failed. Worse, macOS grants are keyed to
 * a code signature, so a grant given to one build silently stopped applying to
 * the next, and the app reported "not granted" while System Settings showed the
 * switch turned on. That is indistinguishable from the app being broken.
 *
 * So they are collected up front, one at a time, and each is verified by asking
 * the system again rather than by assuming the prompt worked. A step that
 * cannot be confirmed does not advance. The point is not the ceremony; it is
 * that by the time somebody uses Toki for the first time, there is nothing left
 * that can interrupt them.
 */

export type PermissionKind =
  | "microphone"
  | "screen_recording"
  | "camera"
  | "accessibility"
  | "input_monitoring";

/** What macOS says about one permission right now. */
export type PermissionStatus =
  | "granted"
  | "denied"
  | "not_determined"
  | "unknown";

export type PermissionSnapshot = Record<PermissionKind, PermissionStatus>;

export type PermissionStepState =
  | "granted"
  /** Never asked. A prompt will appear, so offer to ask. */
  | "askable"
  /**
   * Asked and refused. macOS will not prompt twice, so the only way through is
   * System Settings -- offering "Allow" again would do nothing and look broken.
   */
  | "needs_settings"
  | "unknown";

export type PermissionStep = {
  kind: PermissionKind;
  /** What it lets Toki do, in Toki's voice. Benefit first, mechanism after. */
  title: string;
  detail: string;
  /**
   * Whether Toki is usable at all without it.
   *
   * Only two are. Everything else has a path that works without it, and
   * demanding all five before somebody has seen the app do anything is how a
   * first run turns into a permissions form.
   */
  required: boolean;
  /**
   * Whether the grant only takes effect after a relaunch.
   *
   * Screen recording is the one macOS caches per process: it reports granted
   * while continuing to refuse until the app restarts, which reads as the grant
   * not working.
   */
  requiresRelaunch: boolean;
  /** Where in System Settings this lives, when a prompt is no longer possible. */
  settingsUrl: string;
};

const PRIVACY = "x-apple.systempreferences:com.apple.preference.security?Privacy_";

/**
 * The order they are asked in.
 *
 * Voice and screen first, because between them they are the whole product: say
 * something, have Toki look and point. Somebody who stops after two steps has a
 * working app. The camera comes third because gestures are the part people have
 * to be taught, and it is easier to learn once the rest already works.
 */
export const permissionSteps: readonly PermissionStep[] = Object.freeze([
  {
    kind: "microphone",
    title: "Let me hear you",
    detail: "Only while you hold the shortcut. Nothing is recorded otherwise.",
    required: true,
    requiresRelaunch: false,
    settingsUrl: `${PRIVACY}Microphone`,
  },
  {
    kind: "screen_recording",
    title: "Let me see your screen",
    detail: "So I can find what you are asking about and point at it.",
    required: true,
    requiresRelaunch: true,
    settingsUrl: `${PRIVACY}ScreenCapture`,
  },
  {
    kind: "camera",
    title: "Let me see your hand",
    detail: "For pointing and circling things in the air. You can skip this and use the trackpad instead.",
    required: false,
    requiresRelaunch: false,
    settingsUrl: `${PRIVACY}Camera`,
  },
  {
    kind: "accessibility",
    title: "Let me read what is on screen",
    detail: "So I can name the buttons I point at, instead of guessing from pixels.",
    required: false,
    requiresRelaunch: true,
    settingsUrl: `${PRIVACY}Accessibility`,
  },
  {
    kind: "input_monitoring",
    title: "Let me notice the shortcut",
    detail: "So holding the key works from any app, not just when Toki is in front.",
    required: false,
    requiresRelaunch: true,
    settingsUrl: `${PRIVACY}ListenEvent`,
  },
]);

export function getStepState(status: PermissionStatus): PermissionStepState {
  switch (status) {
    case "granted":
      return "granted";
    case "denied":
      return "needs_settings";
    case "not_determined":
      return "askable";
    default:
      return "unknown";
  }
}

export function findStep(kind: PermissionKind): PermissionStep {
  const step = permissionSteps.find((candidate) => candidate.kind === kind);

  if (step == null) {
    throw new Error(`Unknown permission: ${kind}`);
  }

  return step;
}

/**
 * The first step still worth showing, or null when the flow is over.
 *
 * A permission that was refused still counts as answered. Somebody who said no
 * to the camera has made a decision, and re-presenting it on every launch until
 * they change their mind is nagging, not onboarding.
 */
export function nextPendingStep(
  snapshot: PermissionSnapshot,
  handled: readonly PermissionKind[] = [],
): PermissionStep | null {
  return (
    permissionSteps.find(
      (step) =>
        snapshot[step.kind] !== "granted" && !handled.includes(step.kind),
    ) ?? null
  );
}

/** Whether Toki can do its job: hear a command and look at the screen. */
export function hasRequiredPermissions(snapshot: PermissionSnapshot): boolean {
  return permissionSteps
    .filter((step) => step.required)
    .every((step) => snapshot[step.kind] === "granted");
}

export function isFullyGranted(snapshot: PermissionSnapshot): boolean {
  return permissionSteps.every((step) => snapshot[step.kind] === "granted");
}

const HANDLED_STORAGE_KEY = "toki.permissionsHandled";

/**
 * Which permissions have already been answered, across launches.
 *
 * Held in storage rather than in the component, because the flow does not
 * survive its own process. Screen recording ends in a restart -- sometimes
 * Toki's own, sometimes macOS asking somebody to quit and reopen -- and after
 * that the panel starts again from nothing with no idea how far it had got.
 */
export function readHandledPermissions(
  storage: Pick<Storage, "getItem"> | null = globalThis.localStorage ?? null,
): PermissionKind[] {
  try {
    const raw = storage?.getItem(HANDLED_STORAGE_KEY);
    const saved = raw == null ? [] : (JSON.parse(raw) as unknown);

    return Array.isArray(saved)
      ? permissionSteps
          .map((step) => step.kind)
          .filter((kind) => saved.includes(kind))
      : [];
  } catch {
    return [];
  }
}

export function writeHandledPermissions(
  handled: readonly PermissionKind[],
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage ?? null,
): void {
  try {
    storage?.setItem(HANDLED_STORAGE_KEY, JSON.stringify([...handled]));
  } catch {
    // The flow works for this launch and asks again next time, which is a
    // better failure than refusing to start.
  }
}

export function forgetHandledPermissions(
  storage: Pick<Storage, "removeItem"> | null = globalThis.localStorage ?? null,
): void {
  try {
    storage?.removeItem(HANDLED_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Whether to run the flow at all.
 *
 * Every step that has not been answered, not only the two Toki cannot work
 * without. That distinction used to end the flow: it stopped the moment the
 * microphone and the screen were granted, so the camera, accessibility and
 * input monitoring were never asked for at all.
 *
 * It was invisible while a first run started from nothing, because the steps
 * happened to be walked in order anyway. It appeared the moment the flow was
 * interrupted -- screen recording ends in a restart -- and the panel came back,
 * saw its two required permissions held, and concluded there was nothing left
 * to do. Three permissions silently skipped, including the one the talk
 * shortcut needs, so the headline feature would simply not respond.
 *
 * Declining is still an answer. A skipped step is remembered, so this is not a
 * wizard that reopens every launch until somebody gives in.
 */
export function shouldRunOnboarding(
  snapshot: PermissionSnapshot,
  handled: readonly PermissionKind[] = [],
): boolean {
  return nextPendingStep(snapshot, handled) != null;
}

/** How many steps are done, for the progress dots. */
export function countGranted(snapshot: PermissionSnapshot): number {
  return permissionSteps.filter((step) => snapshot[step.kind] === "granted")
    .length;
}
