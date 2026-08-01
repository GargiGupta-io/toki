import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

type UtilityTab = "voice" | "controls" | "account" | "setup";

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
  pointerExplanationSpeechMuted,
  cameraGesturesEnabled,
  cameraStatus,
  cameraPermission,
  cameraError,
  idleStatusText,
  account,
  setup,
  onVoicePressStart,
  onVoicePressEnd,
  onRefreshCapture,
  onPauseToggle,
  onCameraGesturesToggle,
  onPointerExplanationSpeechMuteToggle,
  onRevealTarget,
  onStartDrag,
  onClose,
}: {
  mode: Exclude<TopUtilityMode, "hidden">;
  status: TokiTopStatusModel | null;
  isPaused: boolean;
  isBusy: boolean;
  voiceActive: boolean;
  voiceLabel: string;
  voiceMessage: string;
  pointerExplanationSpeechMuted: boolean;
  cameraGesturesEnabled: boolean;
  cameraStatus: CameraStreamStatus;
  cameraPermission: CameraPermissionState;
  cameraError: string | null;
  idleStatusText: string;
  account: UtilityAccount | null;
  setup: UtilitySetup;
  onVoicePressStart: () => void;
  onVoicePressEnd: () => void;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onCameraGesturesToggle: () => void;
  onPointerExplanationSpeechMuteToggle: () => void;
  onRevealTarget: () => void;
  onStartDrag: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<UtilityTab>("voice");
  const expanded = mode === "expanded";
  const shellRef = useRef<HTMLElement | null>(null);

  useFittedHeight(shellRef, expanded, activeTab, status?.mode);

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

  // A tab that leads nowhere is worse than one fewer tab.
  const tabs: Array<{ id: UtilityTab; label: string }> = [
    { id: "voice", label: "Voice" },
    { id: "controls", label: "Controls" },
    ...(account ? ([{ id: "account", label: "Account" }] as const) : []),
    { id: "setup", label: "Setup" },
  ];

  return (
    <section
      ref={shellRef}
      className="toki-top-utility"
      data-mode={mode}
      data-status={visibleStatus.mode}
      aria-label="Toki controls"
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
          <TokiMark />
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
            <button type="button" onClick={onClose} aria-label="Close Toki controls">
              &times;
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
          <nav
            className="toki-top-utility__tabs"
            role="tablist"
            aria-label="Toki controls"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "voice" && (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <button
                className="toki-top-utility__talk"
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
                <span className="toki-top-utility__mini-signal" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>{voiceLabel}</strong>
                  <small>{voiceMessage}</small>
                </span>
              </button>

              <p className="toki-note">
                Hold Option anywhere to talk without opening this panel.
              </p>

              <Toggle
                label="Speak explanations"
                detail="Reads out what Toki is pointing at."
                // The stored flag is the mute, so the switch shows its opposite.
                on={!pointerExplanationSpeechMuted}
                onToggle={onPointerExplanationSpeechMuteToggle}
              />
            </div>
          )}

          {activeTab === "controls" && (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <Toggle
                label={getCameraControlLabel({
                  enabled: cameraGesturesEnabled,
                  status: cameraStatus,
                })}
                detail={cameraControlMessage}
                on={cameraGesturesEnabled}
                onToggle={onCameraGesturesToggle}
              />
              <div className="toki-top-utility__commands">
                <button type="button" onClick={onRefreshCapture} disabled={isBusy}>
                  {isBusy ? "Updating…" : "Update screen"}
                </button>
                <button type="button" onClick={onPauseToggle}>
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "account" && account && (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <div className="toki-row">
                <span className="toki-row__text">
                  <strong>{account.statusText}</strong>
                  <small>{account.planText}</small>
                </span>
              </div>

              {account.error && (
                <p className="toki-note" data-tone="warn">
                  {account.error}
                </p>
              )}

              {account.signedIn ? (
                <>
                  {account.canUpgrade && (
                    <Row
                      label="Upgrade to Pro"
                      detail="Opens Stripe in your browser."
                      onClick={account.onUpgrade}
                      disabled={account.busy}
                    />
                  )}
                  {account.canManage && (
                    <Row
                      label="Manage plan"
                      detail="Change your card, or cancel."
                      onClick={account.onManage}
                      disabled={account.busy}
                    />
                  )}
                  <div className="toki-top-utility__commands">
                    <button
                      type="button"
                      onClick={account.onRefresh}
                      disabled={account.busy}
                    >
                      Refresh plan
                    </button>
                    <button
                      type="button"
                      onClick={account.onSignOut}
                      disabled={account.busy}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                <Row
                  label="Sign in"
                  detail="Opens your browser, then returns here."
                  onClick={account.onSignIn}
                  disabled={account.busy}
                />
              )}
            </div>
          )}

          {activeTab === "setup" && (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <p className="toki-section-label">Speech</p>
              <p className="toki-note">{setup.keyStatusText}</p>
              <label className="toki-field">
                <span>OpenAI API key</span>
                <input
                  type="password"
                  value={setup.keyDraft}
                  placeholder={setup.keyStored ? "Replace saved key" : "sk-…"}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setup.onKeyDraftChange(event.target.value)}
                />
              </label>
              {setup.keyError && (
                <p className="toki-note" data-tone="warn">
                  {setup.keyError}
                </p>
              )}
              <div className="toki-top-utility__commands">
                <button
                  type="button"
                  onClick={setup.onSaveKey}
                  disabled={setup.keyBusy || setup.keyDraft.trim().length === 0}
                >
                  Save key
                </button>
                <button
                  type="button"
                  onClick={setup.onClearKey}
                  disabled={setup.keyBusy || !setup.keyStored}
                >
                  Remove
                </button>
              </div>

              <p className="toki-section-label">Local speech</p>
              <p className="toki-note">{setup.whisperStatusText}</p>
              <label className="toki-field">
                <span>Whisper binary</span>
                <input
                  type="text"
                  value={setup.whisperBinary}
                  placeholder="/absolute/path/to/whisper-cli"
                  spellCheck={false}
                  onChange={(event) =>
                    setup.onWhisperBinaryChange(event.target.value)
                  }
                />
              </label>
              <label className="toki-field">
                <span>Whisper model</span>
                <input
                  type="text"
                  value={setup.whisperModel}
                  placeholder="/absolute/path/to/model.bin"
                  spellCheck={false}
                  onChange={(event) =>
                    setup.onWhisperModelChange(event.target.value)
                  }
                />
              </label>
              {setup.whisperError && (
                <p className="toki-note" data-tone="warn">
                  {setup.whisperError}
                </p>
              )}
              <div className="toki-top-utility__commands">
                <button type="button" onClick={setup.onSaveWhisper}>
                  Save paths
                </button>
              </div>

              <p className="toki-section-label">Diagnostics</p>
              <Toggle
                label="Share diagnostics"
                detail="Timings and errors. Never what is on your screen."
                on={setup.diagnosticsEnabled}
                onToggle={setup.onDiagnosticsToggle}
              />
              <Toggle
                label="Include screenshots"
                detail={
                  setup.diagnosticsEnabled
                    ? "Saves pictures of your screen with diagnostics."
                    : "Needs diagnostics turned on first."
                }
                on={setup.screenCapturesEnabled}
                onToggle={setup.onScreenCapturesToggle}
                disabled={!setup.diagnosticsEnabled}
              />

              <p className="toki-section-label">Updates</p>
              <p className="toki-note">{setup.updateText}</p>
              <div className="toki-top-utility__commands">
                <button
                  type="button"
                  onClick={setup.onCheckUpdates}
                  disabled={setup.updateBusy}
                >
                  Check for updates
                </button>
                {setup.canInstallUpdate && (
                  <button
                    type="button"
                    onClick={setup.onInstallUpdate}
                    disabled={setup.updateBusy}
                  >
                    Install
                  </button>
                )}
              </div>
            </div>
          )}
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

/** Toki's mark: the inked ring from the app icon, drawn small. */
function TokiMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.5 5.6a9 9 0 1 0 3 5.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M17.6 5.4l1.5-2.1M19.4 6.2l2.4-1M18.4 8.2l2.5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Row({
  label,
  detail,
  onClick,
  disabled,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="toki-row"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="toki-row__text">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="toki-row__value" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function Toggle({
  label,
  detail,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  detail: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="toki-row"
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="toki-row__text">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="toki-switch" aria-hidden="true" />
    </button>
  );
}

/*
 * The camera's state in words.
 *
 * Recovered rather than rewritten: an earlier pass of this redesign replaced
 * these with a shorter pair that only knew about "on", "off" and "starting",
 * which silently dropped the cases that actually need saying -- permission
 * refused in System Settings, no camera attached, and the prompt still waiting
 * to be answered. Those are the states where a person needs telling what to do.
 */
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

function getCameraControlLabel({
  enabled,
  status,
}: {
  enabled: boolean;
  status: CameraStreamStatus;
}): string {
  if (!enabled || status === "disabled") {
    return "Turn camera + gestures on";
  }

  if (status === "idle" || status === "requesting_permission") {
    return "Starting camera + gestures";
  }

  if (
    status === "permission_denied" ||
    status === "no_camera" ||
    status === "error"
  ) {
    return "Camera + gestures need attention";
  }

  return "Camera + gestures on";
}
