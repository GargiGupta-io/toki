import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  CameraIcon,
  GearIcon,
  PowerIcon,
  MarkIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
} from "./TokiIcons";
import type { CameraPermissionState, CameraStreamStatus } from "@toki/shared";

import type { TokiTopStatusModel, TopUtilityMode } from "./topUtility";
import "./TokiTopUtilitySurface.css";

/**
 * The single surface for everything Toki can be told to do.
 *
 * There used to be a second Preferences window holding the account, the API
 * key, diagnostics and updates. It is gone. A settings window that opens
 * somewhere else is a second place to look for the same thing, and on a menu
 * bar app it also means a Dock-less app suddenly owning a floating window.
 *
 * The tabs are ordered by how often they are touched: talking and pausing
 * every session, the account occasionally, setup once.
 */

/** Sign-in and plan. Absent when the build has no service configured. */
export type UtilityAccount = {
  statusText: string;
  planText: string;
  signedIn: boolean;
  busy: boolean;
  /** Only offered to someone who is not already paying. */
  canUpgrade: boolean;
  /** Only offered once there is a subscription to manage. */
  canManage: boolean;
  error: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onUpgrade: () => void;
  onManage: () => void;
  onRefresh: () => void;
};

/** The things configured once and then forgotten. */
export type UtilitySetup = {
  keyStatusText: string;
  keyStored: boolean;
  keyDraft: string;
  keyBusy: boolean;
  keyError: string | null;
  onKeyDraftChange: (value: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;

  diagnosticsEnabled: boolean;
  screenCapturesEnabled: boolean;
  onDiagnosticsToggle: () => void;
  onScreenCapturesToggle: () => void;

  /**
   * Paths to a local Whisper build, for transcribing without an API key.
   *
   * Typed rather than searched for. An app launched from Finder inherits no
   * shell environment, so an environment variable is absent for every ordinary
   * user; and hunting for a binary on disk is how a writable directory turns
   * into code running inside Toki's screen-recording grant.
   */
  whisperBinary: string;
  whisperModel: string;
  whisperStatusText: string;
  whisperError: string | null;
  onWhisperBinaryChange: (value: string) => void;
  onWhisperModelChange: (value: string) => void;
  onSaveWhisper: () => void;

  updateText: string;
  updateBusy: boolean;
  canInstallUpdate: boolean;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
};

export function TokiTopUtilitySurface({
  mode,
  status,
  isPaused,
  isBusy,
  voiceActive,
  voiceLabel,
  voiceMessage,
  cameraGesturesEnabled,
  cameraStatus,
  cameraPermission,
  cameraError,
  idleStatusText,
  onVoicePressStart,
  onVoicePressEnd,
  onRefreshCapture,
  onPauseToggle,
  onCameraGesturesToggle,
  onRevealTarget,
  onStartDrag,
  onExpand,
  onQuit,
  onOpenSettings,
}: {
  mode: Exclude<TopUtilityMode, "hidden">;
  status: TokiTopStatusModel | null;
  isPaused: boolean;
  isBusy: boolean;
  voiceActive: boolean;
  voiceLabel: string;
  voiceMessage: string;
  cameraGesturesEnabled: boolean;
  cameraStatus: CameraStreamStatus;
  cameraPermission: CameraPermissionState;
  cameraError: string | null;
  idleStatusText: string;
  onVoicePressStart: () => void;
  onVoicePressEnd: () => void;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onCameraGesturesToggle: () => void;
  onRevealTarget: () => void;
  /** Opens the settings window, where everything configured once now lives. */
  onOpenSettings: () => void;
  onStartDrag: () => void;
  /** Clicking the peek bar opens the panel, and makes its window key so the
   *  next click lands on a control rather than on activating the window. */
  onExpand: () => void;
  /** Ends Toki. The menu bar has always had this; the panel had no way to it. */
  onQuit: () => void;
}) {
  const expanded = mode === "expanded";
  const shellRef = useRef<HTMLElement | null>(null);

  // How far the camera housing reaches down over this panel.
  //
  // The panel deliberately starts at the very top of the display so its black
  // meets the housing's and the two read as one shape. The cost is that its
  // first rows would be behind the camera, so the content is inset by exactly
  // the housing's height. Asked for rather than assumed: it differs by model,
  // and an external display has none, where this is zero and nothing moves.
  const [notchInset, setNotchInset] = useState(0);
  useEffect(() => {
    void invoke<number>("top_utility_notch_inset")
      .then((value) => {
        if (Number.isFinite(value) && value >= 0) {
          setNotchInset(value);
        }
      })
      .catch(() => undefined);
  }, []);

  useFittedHeight(shellRef, expanded, status?.mode, isPaused, cameraGesturesEnabled);

  const visibleStatus =
    status ??
    ({
      mode: isPaused ? "paused" : "ready",
      label: isPaused ? "Toki paused" : "Toki",
      message: idleStatusText,
    } satisfies TokiTopStatusModel);

  const cameraControlMessage = getCameraControlMessage({
    enabled: cameraGesturesEnabled,
    status: cameraStatus,
    permission: cameraPermission,
    error: cameraError,
  });

  return (
    <section
      ref={shellRef}
      className="toki-top-utility"
      style={{ "--notch-inset": `${notchInset}px` } as React.CSSProperties}
      data-mode={mode}
      data-status={visibleStatus.mode}
      aria-label="Toki controls"
      onClick={expanded ? undefined : onExpand}
    >
      <header
        className="toki-top-utility__header"
        onPointerDown={(event) => {
          const target = event.target;
          if (
            expanded &&
            event.button === 0 &&
            target instanceof HTMLElement &&
            !target.closest("button")
          ) {
            onStartDrag();
          }
        }}
      >
        <span className="toki-top-utility__identity" aria-hidden="true">
          <MarkIcon />
        </span>
        <span className="toki-top-utility__status-copy" aria-live="polite">
          <strong>{visibleStatus.label}</strong>
          <small>{visibleStatus.message}</small>
        </span>
        <span className="toki-top-utility__window-actions">
          <span
            className="toki-top-utility__activity"
            data-paused={isPaused}
            role="img"
            aria-label={isPaused ? "Paused" : "Active"}
          />
          {expanded && (
            <button type="button" onClick={onQuit} aria-label="Quit Toki">
              <PowerIcon />
            </button>
          )}
        </span>
      </header>

      {expanded && visibleStatus.mode === "confirming" ? (
        <div className="toki-top-utility__expanded">
          <div className="toki-top-utility__reveal-panel">
            <p>
              Review the warning above. Toki will only reveal the guidance
              marker; it will not click or change anything.
            </p>
            <button type="button" onClick={onRevealTarget} autoFocus>
              Show target
            </button>
          </div>
        </div>
      ) : expanded ? (
        <div className="toki-top-utility__expanded">
          <button
            className="toki-talk"
            type="button"
            data-active={voiceActive}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onVoicePressStart();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              onVoicePressEnd();
            }}
            onPointerCancel={onVoicePressEnd}
            onKeyDown={(event) => {
              if (!event.repeat && (event.key === " " || event.key === "Enter")) {
                event.preventDefault();
                onVoicePressStart();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onVoicePressEnd();
              }
            }}
          >
            <span className="toki-talk__meter" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>{voiceLabel}</strong>
              <small>{voiceMessage}</small>
            </span>
          </button>

          <div className="toki-actions">
            <IconButton
              label={cameraGesturesEnabled ? "Turn gestures off" : "Turn gestures on"}
              detail={cameraControlMessage}
              on={cameraGesturesEnabled}
              onClick={onCameraGesturesToggle}
            >
              <CameraIcon />
            </IconButton>
            <IconButton
              label={isPaused ? "Resume" : "Pause"}
              on={!isPaused}
              onClick={onPauseToggle}
            >
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </IconButton>
            <IconButton
              label={isBusy ? "Updating the screen" : "Update screen"}
              onClick={onRefreshCapture}
              disabled={isBusy}
            >
              <RefreshIcon />
            </IconButton>
            <span className="toki-actions__spacer" />
            <IconButton label="Settings" onClick={onOpenSettings}>
              <GearIcon />
            </IconButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Keep the window exactly as tall as what is inside it.
 *
 * Each tab needs a different amount of room, and a window fixed at the tallest
 * leaves the shortest sitting above a slab of empty black. Measuring is the
 * only honest way to know: the content is text at the system font size, so its
 * height depends on wrapping, on the user's display, and on how long a status
 * message happens to be.
 *
 * `useLayoutEffect` rather than `useEffect` -- the measurement has to happen
 * before the frame is shown, or the panel is briefly the wrong size on every
 * tab change and visibly jumps.
 */
function useFittedHeight(
  ref: React.RefObject<HTMLElement | null>,
  expanded: boolean,
  ...whenTheseChange: unknown[]
) {
  const lastSent = useRef(0);

  useLayoutEffect(() => {
    if (!expanded) {
      return;
    }

    const element = ref.current;
    if (element == null) {
      return;
    }

    const send = () => {
      // The panel is `position: fixed; inset: 0`, so it fills the window rather
      // than reporting what it needs. Its children are what have a natural
      // height.
      const measured = Array.from(element.children).reduce(
        (total, child) => total + child.getBoundingClientRect().height,
        0,
      );
      const height = Math.ceil(measured) + 1;

      // A pixel of jitter between measurements is normal on a fractional
      // display scale. Resizing on it would leave the window trembling.
      if (height > 0 && Math.abs(height - lastSent.current) > 2) {
        lastSent.current = height;
        void invoke("set_top_utility_height", { height }).catch(() => undefined);
      }
    };

    send();

    // Content can change height without a tab change: a status message
    // arrives, an error appears, the plan finishes loading.
    const observer = new ResizeObserver(send);
    for (const child of Array.from(element.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, ...whenTheseChange]);
}

/**
 * A round icon button.
 *
 * `on` inverts it rather than tinting it. With no colour available, filled
 * versus hollow is the whole vocabulary for "this is currently doing
 * something", so it has to be unmistakable.
 *
 * The label is the accessible name and the tooltip both: at this size there is
 * no room for text, and an icon nobody can name is a guess.
 */
function IconButton({
  label,
  detail,
  on,
  onClick,
  disabled,
  children,
}: {
  label: string;
  detail?: string;
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="toki-icon-button"
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={detail ? `${label} — ${detail}` : label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function getCameraControlMessage({
  enabled,
  status,
  permission,
  error,
}: {
  enabled: boolean;
  status: CameraStreamStatus;
  permission: CameraPermissionState;
  error: string | null;
}): string {
  if (!enabled || status === "disabled") {
    return "Camera is off. No hand frames are processed.";
  }

  if (status === "requesting_permission" || permission === "prompt") {
    return "Approve the macOS camera prompt to continue.";
  }

  if (status === "permission_denied" || permission === "denied") {
    return "Camera access is blocked in macOS System Settings.";
  }

  if (status === "no_camera") {
    return "No available camera was found.";
  }

  if (status === "error") {
    return error ?? "Camera + gestures could not start.";
  }

  if (status === "active") {
    return "On-device tracking active. Hold two fists for 2s to turn off.";
  }

  return "Preparing local hand tracking…";
}
