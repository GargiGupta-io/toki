// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  countGranted,
  getStepState,
  nextPendingStep,
  permissionSteps,
  readHandledPermissions,
  writeHandledPermissions,
  type PermissionKind,
  type PermissionSnapshot,
  type PermissionStep,
} from "./permissionOnboarding";
import {
  decideCachedPermissionAction,
  describeCachedPermissionAction,
  isProcessCachedPermission,
  livePermissionState,
  restartNoticeMs,
  type LivePermissionState,
} from "./cachedPermissions";
import "./TokiPermissionNotch.css";

/**
 * Asking for a permission, from the notch.
 *
 * This started life as a full-screen card in its own window, which is the wrong
 * shape twice over. It covered the thing somebody was working in, and it did
 * not sit anywhere near where Toki lives -- so an application with no Dock icon
 * and no window suddenly had a window, for the one job it should be least
 * intrusive doing.
 *
 * Small, and hanging from the top where Toki already is. One line saying what
 * is needed, one line saying what to do about it, one button. macOS puts its
 * own dialog or its own Settings pane on screen at the same time, and that is
 * the thing somebody should be reading; this is the label on it, not a rival
 * for attention.
 */

const emptySnapshot: PermissionSnapshot = {
  microphone: "unknown",
  screen_recording: "unknown",
  camera: "unknown",
  accessibility: "unknown",
  input_monitoring: "unknown",
};

/**
 * What to say, in Toki's voice.
 *
 * First person and specific: "I need to hear you", not "Microphone access
 * required". The second one is what an installer says.
 */
const asks: Record<PermissionKind, { need: string; todo: string }> = {
  microphone: {
    need: "I need to hear you.",
    todo: "Only while you hold the shortcut.",
  },
  screen_recording: {
    need: "I need to see your screen.",
    todo: "So I can find what you ask about and point at it.",
  },
  camera: {
    need: "I need to see your hand.",
    todo: "For pointing in the air. Skip it and use the trackpad instead.",
  },
  accessibility: {
    need: "I need to read the screen.",
    todo: "So I can name buttons instead of guessing from pixels.",
  },
  input_monitoring: {
    need: "I need to notice the shortcut.",
    todo: "So holding the key works from any app.",
  },
};

/**
 * What a freshly started process would be told.
 *
 * Answered by a second copy of Toki that starts, asks, prints and exits. This
 * process cannot ask again: macOS gave it an answer at launch and repeats that
 * answer for as long as it lives.
 */
async function readLivePermissions(): Promise<PermissionSnapshot | null> {
  try {
    return await invoke<PermissionSnapshot | null>("permissions_live");
  } catch {
    return null;
  }
}

async function readSnapshot(): Promise<PermissionSnapshot> {
  try {
    return await invoke<PermissionSnapshot>("permission_snapshot");
  } catch {
    return emptySnapshot;
  }
}

/**
 * Raise the camera or microphone prompt by opening the device.
 *
 * macOS shows those two when something tries to use them, not on request. The
 * stream is stopped in a finally, so a refusal, a missing device and a normal
 * grant all leave the hardware released.
 */
async function promptForDevice(kind: "camera" | "microphone"): Promise<void> {
  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera" ? { video: true } : { audio: true },
    );
  } catch {
    // The snapshot that follows is what decides.
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export function TokiPermissionNotch({
  onFinished,
}: {
  onFinished: () => void;
}) {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot>(emptySnapshot);
  const [loaded, setLoaded] = useState(false);
  /*
   * Read from storage, not started empty.
   *
   * The flow does not survive its own process: screen recording ends in a
   * restart, and after one the panel used to begin again knowing nothing about
   * how far it had got.
   */
  const [handled, setHandled] = useState<PermissionKind[]>(readHandledPermissions);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  /*
   * Screen recording, which does not behave like the others.
   *
   * `live` is what a freshly started process would be told, which is the only
   * way a running Toki can notice a grant it was refused at launch.
   * `promptSpent` is whether Apple's dialog has already been raised -- macOS
   * shows it once per install, so after that the Allow button does nothing and
   * Settings is the only route.
   */
  const [liveSnapshot, setLiveSnapshot] = useState<PermissionSnapshot | null>(null);
  const [promptSpent, setPromptSpent] = useState<PermissionKind[]>([]);

  useEffect(() => {
    void readSnapshot().then((next) => {
      setSnapshot(next);
      setLoaded(true);
    });


    return () => {
      cancelled.current = true;
    };
  }, []);

  const step = loaded ? nextPendingStep(snapshot, handled) : null;

  /*
   * The flow is over when there is nothing left to ask about.
   *
   * Decided here rather than in the buttons. It used to be checked inside the
   * "Next" handler and nowhere else, so answering the last permission with
   * "Skip" ended the flow without telling anybody: this component rendered
   * nothing, the panel around it went on rendering its black box, and what was
   * left on screen was an empty panel with the physical notch covering the
   * middle of it -- two slivers of black at the top of the display and no way
   * to make them go away.
   *
   * There are three ways to finish a step and there will be more; none of them
   * should have to remember to do this.
   */
  const finished = useRef(false);

  useEffect(() => {
    if (!loaded || step != null || finished.current) {
      return;
    }

    finished.current = true;
    onFinished();
  }, [loaded, step, onFinished]);

  /*
   * Only ask while a permission macOS caches is what is showing.
   *
   * This ran on arrival, which meant a second Toki process started up to ask
   * about a permission three steps away while the panel was on the microphone.
   * Starting a process to answer something nobody has been asked yet is work
   * at the wrong moment however cheap it is.
   */
  useEffect(() => {
    if (step == null || !isProcessCachedPermission(step.kind)) {
      return;
    }

    void readLivePermissions().then(setLiveSnapshot);
  }, [step?.kind]);

  const live: LivePermissionState =
    step == null
      ? "denied"
      : livePermissionState(snapshot[step.kind], liveSnapshot?.[step.kind]);

  /**
   * Ask, then verify by asking the system again.
   *
   * A prompt appearing is not a permission being held, and every permission
   * failure this app has had looked, from the inside, like the prompt having
   * worked. The poll is because the grant lands when somebody clicks the system
   * dialog, which is not a moment this code is told about.
   */
  const confirm = useCallback(async (kind: PermissionKind) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (cancelled.current) {
        return;
      }

      const next = await readSnapshot();
      setSnapshot(next);

      if (next[kind] === "granted") {
        return;
      }

      /*
       * The permissions this process cannot see change.
       *
       * The camera and microphone report honestly on every read. These three
       * answer once per process, so the loop above would spin twenty times
       * against a cached no -- eight seconds of a greyed-out button -- while
       * the switch sat visibly on in the list.
       */
      if (isProcessCachedPermission(kind)) {
        const probed = await readLivePermissions();
        setLiveSnapshot(probed);

        if (probed?.[kind] === "granted") {
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }, []);

  /*
   * Granted, but not to this process. Restart and pick up where we were.
   *
   * Not offered as a button. Asking somebody to quit and reopen an application
   * that has no window and no Dock icon is asking them to go and find it; and
   * they have just done the thing that was asked of them, so being told there
   * is another step reads as it not having worked.
   */
  useEffect(() => {
    if (live !== "pending_restart") {
      return;
    }

    const timer = setTimeout(() => {
      void invoke("restart_toki").catch(() => {});
    }, restartNoticeMs);

    return () => clearTimeout(timer);
  }, [live]);

  const act = useCallback(
    async (target: PermissionStep) => {
      setBusy(true);

      try {
        if (isProcessCachedPermission(target.kind)) {
          const action = decideCachedPermissionAction({
            live,
            promptSpent: promptSpent.includes(target.kind),
          });

          if (action === "settings") {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl(target.settingsUrl).catch(() => undefined);
          } else if (action === "prompt") {
            // Apple's own dialog, in place. This is what HeyClicky did, and
            // why it never triggered the "quit and reopen" alert -- that alert
            // only appears when a switch is flipped in the Settings list for
            // an application that is already running.
            setPromptSpent((current) => [...current, target.kind]);
            await invoke<boolean>("request_permission", {
              kind: target.kind,
            }).catch(() => undefined);
          }

          await confirm(target.kind);
          return;
        }

        if (getStepState(snapshot[target.kind]) === "needs_settings") {
          // macOS prompts once. After a refusal the only way through is the
          // Settings pane, and offering "Allow" again would do nothing at all.
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(target.settingsUrl).catch(() => undefined);
        } else if (target.kind === "camera" || target.kind === "microphone") {
          await promptForDevice(target.kind);
        } else {
          await invoke<boolean>("request_permission", {
            kind: target.kind,
          }).catch(() => undefined);
        }

        await confirm(target.kind);
      } finally {
        setBusy(false);
      }
    },
    [confirm, live, promptSpent, snapshot],
  );

  if (!loaded || step == null) {
    return null;
  }

  const state = getStepState(snapshot[step.kind]);
  const granted = snapshot[step.kind] === "granted";

  /*
   * Screen recording gets its own wording, because it is the only step where
   * what to do next depends on something the snapshot cannot see.
   */
  const cached = isProcessCachedPermission(step.kind)
    ? decideCachedPermissionAction({
        live,
        promptSpent: promptSpent.includes(step.kind),
      })
    : null;
  const ask =
    cached != null
      ? describeCachedPermissionAction(cached, asks[step.kind])
      : { ...asks[step.kind], button: state === "needs_settings" ? "Open" : "Allow" };

  return (
    <section className="toki-permission-notch" aria-label="Toki needs permission">
      <div className="toki-permission-notch__dots" aria-hidden="true">
        {permissionSteps.map((candidate) => (
          <span
            key={candidate.kind}
            data-state={
              snapshot[candidate.kind] === "granted"
                ? "done"
                : candidate.kind === step.kind
                  ? "current"
                  : "pending"
            }
          />
        ))}
      </div>

      <p className="toki-permission-notch__need">{ask.need}</p>
      <p className="toki-permission-notch__todo">
        {cached == null && state === "needs_settings"
          ? "macOS only asks once — switch me on in the list."
          : ask.todo}
      </p>

      <div className="toki-permission-notch__actions">
        {cached === "restart" ? (
          // No button. The restart is already scheduled, and offering one here
          // would be offering to do something that is happening anyway.
          null
        ) : granted ? (
          <button
            type="button"
            className="toki-permission-notch__primary"
            onClick={() => {
              const next = [...handled, step.kind];
              setHandled(next);
              writeHandledPermissions(next);
            }}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="toki-permission-notch__primary"
            onClick={() => void act(step)}
            disabled={busy}
          >
            {ask.button}
          </button>
        )}

        {step.required ? null : (
          <button
            type="button"
            className="toki-permission-notch__skip"
            onClick={() => {
              // Declining is an answer, and it is remembered. Otherwise the
              // panel reopens on every launch until somebody gives in.
              const next = [...handled, step.kind];
              setHandled(next);
              writeHandledPermissions(next);
            }}
          >
            Skip
          </button>
        )}
      </div>

      <p className="toki-permission-notch__count">
        {countGranted(snapshot)} of {permissionSteps.length} allowed
      </p>
    </section>
  );
}
